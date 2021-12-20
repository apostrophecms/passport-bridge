module.exports = {
  init(self) {
    self.enablePassportStrategies();
  },
  methods(self) {
    return {
      enablePassportStrategies() {
        self.strategies = {};
        if (!self.apos.baseUrl) {
          throw new Error('@apostrophecms/passport-bridge: you must configure the top-level "baseUrl" option for apostrophe');
        }
        if (!Array.isArray(self.options.strategies)) {
          throw new Error('@apostrophecms/passport-bridge: you must configure the "strategies" option');
        }

        self.options.strategies.forEach(spec => {
          var Strategy;
          if (spec.module) {
            Strategy = self.apos.root.require(spec.module);
          } else {
            Strategy = spec.Strategy;
          }
          if (!Strategy) {
            throw new Error('@apostrophecms/passport-bridge: each strategy must have a "module" setting\n' +
              'giving the name of an npm module installed in your project that\n' +
              'is passport-oauth2, passport-oauth or a subclass with a compatible\n' +
              'interface, such as passport-gitlab2, passport-twitter, etc.\n\n' +
              'You may instead pass a strategy constructor as a Strategy property,\n' +
              'but the other way is much more convenient.');
          }
          // Are there strategies requiring no options? Probably not, but maybe...
          spec.options = spec.options || {};
          if (!spec.name) {
            // It's hard to find the strategy name; it's not the same
            // as the npm name. And we need it to build the callback URL
            // sensibly. But we can do it by making a dummy strategy object now
            const dummy = new Strategy(Object.assign(
              {
                callbackURL: 'https://dummy/test'
              },
              spec.options
            ), self.findOrCreateUser(spec));
            spec.name = dummy.name;
          }
          spec.label = spec.label || spec.name;
          spec.options.callbackURL = self.getCallbackUrl(spec, true);
          self.strategies[spec.name] = new Strategy(spec.options, self.findOrCreateUser(spec));
          self.apos.login.passport.use(self.strategies[spec.name]);
          self.addLoginRoute(spec);
          self.addCallbackRoute(spec);
          self.addFailureRoute(spec);
        });
      },

      // Returns the oauth2 callback URL, which must match the route
      // established by `addCallbackRoute`. If `absolute` is true
      // then `baseUrl` and `apos.prefix` are prepended, otherwise
      // not (because `app.get` automatically prepends a prefix).
      // If the callback URL was preconfigured via spec.options.callbackURL
      // it is returned as-is when `absolute` is true, otherwise
      // the pathname is returned with any `apos.prefix` removed
      // to avoid adding it twice in `app.get` calls.
      getCallbackUrl(spec, absolute) {
        let url;
        if (spec.options && spec.options.callbackURL) {
          url = spec.options.callbackURL;
          if (absolute) {
            return url;
          }
          const parsed = new URL(url);
          url = parsed.pathname;
          if (self.apos.prefix) {
            // Remove the prefix if present, so that app.get doesn't
            // add it redundantly
            return url.replace(new RegExp('^' + self.apos.util.regExpQuote(self.apos.prefix)), '');
          }
          return parsed.pathname;
        }
        return (absolute ? (self.apos.baseUrl + self.apos.prefix) : '') + '/auth/' + spec.name + '/callback';
      },

      // Returns the URL you should link users to in order for them
      // to log in. If `absolute` is true then `baseUrl` and `apos.prefix`
      // are prepended, otherwise not (because `app.get` automatically prepends a prefix).
      getLoginUrl(spec, absolute) {
        return (absolute ? (self.apos.baseUrl + self.apos.prefix) : '') + '/auth/' + spec.name + '/login';
      },

      // Adds the login route, which will be `/auth/strategyname/login`, where the strategy name
      // depends on the passport module being used.
      //
      // Redirect users to this URL to start the process of logging them in via each strategy
      addLoginRoute(spec) {
        self.apos.app.get(self.getLoginUrl(spec), (req, res) => {
          req.session.passportLocale = {
            oldLocale: req.query.oldLocale,
            newLocale: req.query.newLocale,
            oldSlug: req.query.oldSlug
          };
          return res.redirect(self.apos.url.build(req.url, {
            newLocale: null,
            oldLocale: null,
            oldSlug: null
          }));
        }, self.apos.login.passport.authenticate(spec.name, spec.authenticate));
      },

      // Adds the callback route associated with a strategy. oauth-based strategies and
      // certain others redirect here to complete the login handshake
      addCallbackRoute(spec) {
        self.apos.app.get(self.getCallbackUrl(spec, false),
          // middleware
          self.apos.login.passport.authenticate(
            spec.name, {
              failureRedirect: self.getFailureUrl(spec)
            }
          ),
          // actual route
          self.apos.login.afterLogin
        );
      },

      addFailureRoute(spec) {
        self.apos.app.get(self.getFailureUrl(spec), function (req, res) {
          // Gets i18n'd in the template
          return self.sendPage(req, 'error', {
            spec: spec,
            message: 'Your credentials were not accepted, your account is not affiliated with this site, or an existing account has the same username or email address.'
          });
        });
      },

      getFailureUrl(spec) {
        return '/auth/' + spec.name + '/error';
      },

      // Given a strategy spec from the configuration, return
      // an oauth passport callback function to find the user based
      // on the profile, creating them if appropriate.

      findOrCreateUser(spec) {

        return function(accessToken, refreshToken, profile, callback) {
          const req = self.apos.task.getReq();
          let criteria = {};
          let emails;

          if (spec.accept) {
            if (!spec.accept(profile)) {
              return callback(null, false);
            }
          }

          emails = self.getRelevantEmailsFromProfile(spec, profile);
          if (spec.emailDomain && (!emails.length)) {
            // Email domain filter is in effect and user has no emails or
            // only emails in the wrong domain
            return callback(null, false);
          }

          if (typeof (spec.match) === 'function') {
            criteria = spec.match(profile);
          } else {
            switch (spec.match || 'username') {
              case 'id':
              if (!profile.id) {
                console.error('@apostrophecms/passport-bridge: profile has no id. You probably want to set the "match" option for this strategy to "username" or "email".');
                return callback(null, false);
              }
              criteria[spec.name + 'Id'] = profile.id;
              break;
              case 'username':
              if (!profile.username) {
                console.error('@apostrophecms/passport-bridge: profile has no username. You probably want to set the "match" option for this strategy to "id" or "email".');
                return callback(null, false);
              }
              criteria.username = profile.username;
              break;
              case 'email':
              case 'emails':
              if (!emails.length) {
                // User has no email
                return callback(null, false);
              }
              criteria.$or = emails.map(email => {
                return { email }
              })
              break;
              default:
              return callback(new Error(`@apostrophecms/passport-bridge: ${spec.match} is not a supported value for the match property`));
            }
          }
          criteria.disabled = { $ne: true };

          const user = await self.apos.user.find(req, criteria).toObject();

          try {
            if (user) {
              return user;
            }
            if (!self.options.create) {
              return false;
            }
            return await createUser(spec, profile);
          } catch (err) {
            throw self.apos.error('user', err);
          }
        };
      },

      // Returns an array of email addresses found in the user's
      // profile, via profile.emails[n].value, profile.emails[n] (a string),
      // or profile.email. Passport strategies usually normalize
      // to the first of the three.
      getRelevantEmailsFromProfile(spec, profile) {
        let emails = [];
        if (Array.isArray(profile.emails) && profile.emails.length) {
          (profile.emails || []).forEach(email => {
            if (typeof (email) === 'string') {
              // maybe someone does this as simple strings...
              emails.push(email);
              // but google does it as objects with value properties
            } else if (email && email.value) {
              emails.push(email.value);
            }
          });
        } else if (profile.email) {
          emails.push(profile.email);
        }
        if (spec.emailDomain) {
          emails = emails.filter(email => {
            const endsWith = '@' + spec.emailDomain;
            return email.substr(email.length - endsWith.length) === endsWith;
          });
        }
        return emails;
      },

      // Create a new user based on a profile. This occurs only
      // if the "create" option is set and a user arrives who has
      // a valid passport profile but does not exist in the local database.
      async createUser(spec, profile) {
        const user = self.apos.user.newInstance();
        user.role = await self.userRole();
        user.username = profile.username;
        user.title = profile.displayName || profile.username || '';
        user[spec.name + 'Id'] = profile.id;
        if (!user.username) {
          user.username = self.apos.util.slugify(user.title);
        }
        const emails = self.getRelevantEmailsFromProfile(spec, profile);
        if (emails.length) {
          user.email = emails[0];
        }
        if (profile.name) {
          user.firstName = profile.name.givenName;
          if (profile.name.middleName) {
            user.firstName += ' ' + profile.name.middleName;
          }
          user.lastName = profile.name.familyName;
        } else if (profile.firstName || profile.lastName) {
          user.firstName = profile.firstName;
          user.lastName = profile.lastName;
        } else if (profile.displayName) {
          const parsedName = humanname.parse(profile.displayName);
          user.firstName = parsedName.firstName;
          user.lastName = parsedName.lastName;
        }
        const req = self.apos.task.getReq();
        if (spec.import) {
          // Allow for specialized import of more fields
          spec.import(profile, user);
        }
        await self.apos.user.insert(req, user);
        return user;
      },

      // Overridable method for determining the default role
      // of newly created users.
      async userRole() {
        return 'guest';
      }
    };
  },
  handlers(self) {
    return {
      '@apostrophecms/login:after': {
        async redirectToNewLocale(req) {
          if (!req.session.passportLocale) {
            return;
          }
          const i18n = self.apos.i18n;
          const {
            oldLocale,
            newLocale,
            oldSlug
          } = req.session.passportLocale;
          delete req.session.passportLocale;
          const crossDomainSessionToken = self.apos.util.generateId();
          await self.apos.cache.set('@apostrophecms/i18n:cross-domain-sessions', crossDomainSessionToken, req.session, 60 * 60);
          req.user = await self.apos.login.deserializeUser(req.user._id);
          let doc = await self.apos.doc.find(req, {
            slug: oldSlug
          }).locale(oldLocale).relationships(false).areas(false).toObject();
          if (doc && doc.aposDocId) {
            doc = await self.apos.doc.find(req, {
              aposDocId: doc.aposDocId
            }).locale(newLocale).toObject();
          }

          let slug;
          if (doc) {
            slug = doc.slug;
          } else {
            // Fall back to home page
            slug = '/';
            if (i18n.locales[newLocale] && i18n.locales[newLocale].prefix) {
              slug = i18n.locales[newLocale].prefix + '/';
            }
          }
          let url = self.apos.url.build(i18n.action + '/link-to-locale', {
            slug,
            newLocale,
            crossDomainSessionToken,
            cb: Math.random().toString().replace('.', '')
          });
          // TODO A3 BETA is self.apos.i18n.hostnamesInUse the equivalent here?
          console.log(i18n.locales)
          console.log(i18n.hostnamesInUse)
          if (workflow.hostnames && workflow.hostnames[newLocale]) {
            const oldLocale = req.locale;
            req.locale = newLocale;
            url = self.apos.page.getBaseUrl(req) + url;
            req.locale = oldLocale;
          }
          if (url.match(/^https?:/)) {
            req.redirect = url;
          } else {
            // Because any sitewide prefix will already be added
            // by res.redirect() as patched by apostrophe and invoked
            // by the afterLogin handler
            req.redirect = url.replace(self.apos.prefix, '');
          }
        }
      }
    };
  },
  tasks(self) {
    return {
      listUrls: {
        usage: 'Run this task to list the login URLs for each registered strategy.\n' +
        'This is helpful when writing markup to invite users to log in.',
        task: () => {
          console.log('These are the login URLs you may wish to link users to:\n');
          self.options.strategies.forEach(spec => {
            console.log(`${spec.label}: ${self.getLoginUrl(spec, true)}`);
          });
          console.log('\nThese are the callback URLs you may need to configure on sites:\n');
          self.options.strategies.forEach(spec => {
            console.log(`${spec.label}: ${self.getCallbackUrl(spec, true)}`);
          });
        }
      }
    };
  },
  components(self) {
    return {
      loginLinks(req, data) {
        return {
          links: self.options.strategies.map(spec => {
            let href = self.getLoginUrl(spec, true);
            if (self.apos.i18n.locales.length > 1) {
              href = self.apos.url.build(href, {
                oldLocale: req.locale,
                newLocale: req.locale.replace(':draft', ':published'),
                // TODO A3 PORT req.slug is wrong here
                oldSlug: req.slug
              });
            }
            return {
              name: spec.name,
              label: spec.label,
              href
            };
          })
        };
      }
    };
  }
};

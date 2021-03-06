const humanname = require('humanname');

module.exports = {
  init(self) {
    self.enablePassportStrategies();
  },
  options: {
    i18n: {
      ns: 'aposPassportBridge'
    }
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
          // Works with npm modules that export the strategy directly, npm modules
          // that export a Strategy property, and directly passing in a strategy property
          // in the spec
          const strategyModule = spec.module && self.apos.root.require(spec.module);
          const Strategy = strategyModule ? (strategyModule.Strategy || strategyModule) : spec.Strategy;
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
        self.apos.app.get(self.getLoginUrl(spec), (req, res, next) => {
          if (req.query.newLocale) {
            req.session.passportLocale = {
              oldLocale: req.query.oldLocale,
              newLocale: req.query.newLocale,
              oldAposDocId: req.query.oldAposDocId
            };
            return res.redirect(self.apos.url.build(req.url, {
              newLocale: null,
              oldLocale: null,
              oldAposDocId: null
            }));
          } else {
            return next();
          }
        }, self.apos.login.passport.authenticate(spec.name, spec.authenticate));
      },

      // Adds the callback route associated with a strategy. oauth-based strategies and
      // certain others redirect here to complete the login handshake
      addCallbackRoute(spec) {
        self.apos.app.get(self.getCallbackUrl(spec, false),
          // middleware
          self.apos.login.passport.authenticate(
            spec.name,
            {
              failureRedirect: self.getFailureUrl(spec)
            }
          ),
          // The actual route reached after authentication redirects
          // appropriately, either to an explicitly requested location
          // or the home page
          (req, res) => {
            const redirect = req.session.passportRedirect || '/';
            delete req.session.passportRedirect;
            return res.rawRedirect(redirect);
          }
        );
      },

      addFailureRoute(spec) {
        self.apos.app.get(self.getFailureUrl(spec), function (req, res) {
          // Gets i18n'd in the template
          return self.sendPage(req, 'error', {
            spec: spec,
            message: 'aposPassportBridge:rejected'
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
        return async function(accessToken, refreshToken, profile, callback) {
          const req = self.apos.task.getReq();
          let criteria = {};

          if (spec.accept) {
            if (!spec.accept(profile)) {
              return callback(null, false);
            }
          }

          const emails = self.getRelevantEmailsFromProfile(spec, profile);
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
                  self.apos.util.error('@apostrophecms/passport-bridge: profile has no id. You probably want to set the "match" option for this strategy to "username" or "email".');
                  return callback(null, false);
                }
                criteria[spec.name + 'Id'] = profile.id;
                break;
              case 'username':
                if (!profile.username) {
                  self.apos.util.error('@apostrophecms/passport-bridge: profile has no username. You probably want to set the "match" option for this strategy to "id" or "email".');
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
                  return { email };
                });
                break;
              default:
                return callback(new Error(`@apostrophecms/passport-bridge: ${spec.match} is not a supported value for the match property`));
            }
          }
          criteria.disabled = { $ne: true };
          try {
            const user = await self.apos.user.find(req, criteria).toObject() || (self.options.create && await self.createUser(spec, profile));
            return callback(null, user || false);
          } catch (err) {
            self.apos.util.error(err);
            return callback(err);
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
        return (self.options.create && self.options.create.role) || 'guest';
      }
    };
  },
  handlers(self) {
    return {
      '@apostrophecms/login:afterSessionLogin': {
        async redirectToNewLocale(req) {
          if (!req.session.passportLocale) {
            return;
          }
          const i18n = self.apos.i18n;
          const {
            oldLocale,
            newLocale,
            oldAposDocId
          } = req.session.passportLocale;
          delete req.session.passportLocale;
          const crossDomainSessionToken = self.apos.util.generateId();
          await self.apos.cache.set('@apostrophecms/i18n:cross-domain-sessions', crossDomainSessionToken, req.session, 60 * 60);
          let doc = await self.apos.doc.find(req, {
            aposDocId: oldAposDocId
          }).locale(`${oldLocale}:draft`).relationships(false).areas(false).toObject();
          if (doc && doc.aposDocId) {
            doc = await self.apos.doc.find(req, {
              aposDocId: doc.aposDocId
            }).locale(`${newLocale}:draft`).toObject();
          }
          let route;
          if (doc) {
            const action = self.apos.page.isPage(doc) ? self.apos.page.action : self.apos.doc.getManager(doc).action;
            route = `${action}/${doc._id}/locale/${newLocale}`;
          } else {
            // Fall back to home page, with appropriate prefix
            route = '/';
            if (i18n.locales[newLocale] && i18n.locales[newLocale].prefix) {
              route = i18n.locales[newLocale].prefix + '/';
            }
          }

          let url = self.apos.url.build(route, {
            aposLocale: req.oldLocale,
            aposCrossDomainSessionToken: crossDomainSessionToken
          });

          if (i18n.locales[newLocale] && i18n.locales[newLocale].hostname) {
            const oldLocale = req.locale;
            // Force use of correct hostname for new locale
            req.locale = newLocale;
            url = self.apos.page.getBaseUrl(req) + url;
            req.locale = oldLocale;
          }
          req.session.passportRedirect = url;
        }
      },
      'apostrophe:modulesRegistered': {
        addRoutes() {
          self.options.strategies.forEach(spec => {
            self.addLoginRoute(spec);
            self.addCallbackRoute(spec);
            self.addFailureRoute(spec);
          });
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
          // eslint-disable-next-line no-console
          console.log('These are the login URLs you may wish to link users to:\n');
          self.options.strategies.forEach(spec => {
            // eslint-disable-next-line no-console
            console.log(`${spec.label}: ${self.getLoginUrl(spec, true)}`);
          });
          // eslint-disable-next-line no-console
          console.log('\nThese are the callback URLs you may need to configure on sites:\n');
          self.options.strategies.forEach(spec => {
            // eslint-disable-next-line no-console
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
            if (Object.keys(self.apos.i18n.locales).length > 1) {
              const context = req.data.piece || req.data.page;
              href = self.apos.url.build(href, {
                oldLocale: req.locale,
                newLocale: req.locale.replace(':draft', ':published'),
                oldAposDocId: (context && context.aposDocId)
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

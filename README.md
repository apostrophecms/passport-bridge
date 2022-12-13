<div align="center">
  <img src="https://raw.githubusercontent.com/apostrophecms/apostrophe/main/logo.svg" alt="ApostropheCMS logo" width="80" height="80">

  <h1>Apostrophe Passport Bridge</h1>
  <p>
    <a aria-label="Apostrophe logo" href="https://v3.docs.apostrophecms.org">
      <img src="https://img.shields.io/badge/MADE%20FOR%20Apostrophe%203-000000.svg?style=for-the-badge&logo=Apostrophe&labelColor=6516dd">
    </a>
    <a aria-label="Test status" href="https://github.com/apostrophecms/passport-bridge/actions">
      <img alt="GitHub Workflow Status (branch)" src="https://img.shields.io/github/workflow/status/apostrophecms/passport-bridge/Tests/main?label=Tests&labelColor=000000&style=for-the-badge">
    </a>
    <a aria-label="Join the community on Discord" href="http://chat.apostrophecms.org">
      <img alt="" src="https://img.shields.io/discord/517772094482677790?color=5865f2&label=Join%20the%20Discord&logo=discord&logoColor=fff&labelColor=000&style=for-the-badge&logoWidth=20">
    </a>
    <a aria-label="License" href="https://github.com/apostrophecms/passport-bridge/blob/main/LICENSE.md">
      <img alt="" src="https://img.shields.io/static/v1?style=for-the-badge&labelColor=000000&label=License&message=MIT&color=3DA639">
    </a>
  </p>
</div>

`apostrophe-passport` works together with `passport-google-oauth20`, `passport-gitlab2` and similar [passport](https://npmjs.org/package/passport) strategy modules to let users log in to Apostrophe CMS sites via Google, Gitlab and other identity providers. This feature is often called federation or single sign-on.

## Installation

To install the module, use the command line to run this command in an Apostrophe project's root directory:

```
npm install @apostrophecms/passport-bridge
# Just an example — you can use many strategy modules
npm install --save passport-google-oauth20
```

Most modules that have "passport" in the name and let you log in via a third-party website will work.

## Usage

Enable the `@apostrophecms/passport-bridge` module in the `app.js` file:

```javascript

require('apostrophe')({
  // Configuring baseUrl is mandatory for this module. For local dev
  // testing you can set it to http://localhost:3000 while in production
  // it must be real and correct
  baseUrl: 'http://myproductionurl.com',
  shortName: 'my-project',
  modules: {
    '@apostrophecms/passport-bridge': {}
  }
});
```

Then configure the module in `modules/@apostrophecms/passport-bridge/index.js` in your project folder:

```javascript
module.exports = {
  // In modules/@apostrophecms/passport-bridge/index.js
  options: {
    strategies: [
      {
        // You must npm install --save this module in your project first
        module: 'passport-google-oauth20',
        options: {
          // Options for passport-google-oauth20
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET
        },
        // Ignore users whose email address does not match this domain
        // according to the identity provider
        emailDomain: 'YOUR-DOMAIN-HERE.com',
        // Use the user's email address as their identity
        match: 'email',
        // Strategy-specific options that must be passed to the authenticate middleware.
        // See the documentation of the strategy module you are using
        authenticate: {
          // 'email' for the obvious, 'profile' for the displayName (for the create option)
          scope: [ 'email', 'profile' ]
        }
      }
    ]
  }
};
```

> ⚠️ Since we're not using the `create` option, users must actually exist in
> Apostrophe with the same username or email address, depending on the
> `match` option. If you want to automatically create users in Apostrophe,
> see [creating users on demand](#creating-users-on-demand) below.

### Adding login links

The easiest way to enable login is to use the `loginLinks` async component in your template:

```markup
{% component "@apostrophecms/passport-bridge:loginLinks" %}
```

This component will output links that attempt to bring the user back to the same page after login, and to keep them in the same locale even if your site has separate hostnames configured for separate locales.

You can override this template's markup by copying `views/loginLinks.html` from this npm module to your project-level `modules/@apostrophecms/passport-bridge/views` folder.

You can also determine the login URLs by invoking the `@apostrophecms/passport-bridge:list-urls` task, however this method does not give you a way to preserve the current URL or redirect back to the current locale's hostname.

### Configuring your identity provider

#### What is my oauth callback URL?

Many strategies require an oauth callback URL. To discover those, run this command line task to print the URLs for login, and for the oauth callback URLs:

```
node app @apostrophecms/passport-bridge:listUrls
```

You'll see something like:

```
These are the login URLs you may wish to link users to:

/auth/gitlab/login

These are the callback URLs you may need to configure on sites:

http://localhost:3000/auth/gitlab/callback
```

⚠️ You can use a URL like `http://localhost:3000` for testing but in production you must use your production URL. Most identity providers will reject a URL beginning with `http:` or an IP address, except for `http://localhost:3000` which is often accepted for testing purposes only.

#### Where do I get my `clientID`, `clientSecret`, etc.?

You get these from the identity provider, usually by adding an "app" to your profile or developer console. In the case of Google you will need to [create an application in the Google API console and authorize it to perform oauth logins](https://developers.google.com/). See the documentation of the passport strategy module you're using.

### Creating users on demand

If you wish you can enable automatic creation of new accounts for any user who is valid according to your login strategy, for instance any user in your Google workspace.

```javascript
module.exports = {
  // In modules/@apostrophecms/passport-bridge/index.js
  options: {
    ...
    create: {
      // If you wish to treat all valid google users in your domain as
      // admins of the site. See also `guest`, `contributor`, `editor`
      //
      role: 'admin'
    }
  }
};
```

### Beefing up the "create" option: copying extra properties

The "create" option shown above will create a user with minimal information: first name, last name, full name, username, and email address (where available).

If you wish to import other fields from the profile object provided by the passport strategy, add an `import` function to your configuration for that strategy. The `import` function receives `(profile, user)` and may copy properties from `profile` to `user` as it sees fit. It may not be an async function.

### Multiple strategies

You may enable more than one strategy at the same time. Just configure them consecutively in the `strategies` array. This means you can have login via Twitter, Google, etc. on the same site.

> ⚠️ Take care when choosing what identity providers to trust. When using single sign-on, your site's security is only as good as that of the identity provider you are trusting. If multiple strategies are enabled with `email` as the matching method, and a malicious user succeeds in creating an account with that email address that matches any of the strategies, then that is sufficient for them to log in. Most major public providers, like Facebook, Twitter or Google, do require the user to prove they control an email address before associating it with an account.

## Frequently asked questions

### Where do I `require` the passport strategy?

You don't. Apostrophe does it for you. You pass its configuration as part of the `strategies` option, via the `options` sub-property and sometimes also the `authenticate` sub-property if your chosen strategy  has options that must be passed to its `authenticate` middleware, as with Google (you'll see this in its documentation).

### Can I change how users are mapped between the identity provider and my site?

If you don't like the default behavior, you can change it. The mapping is up to you. Usernames and emails are *almost* permanent, but people do change them and that can be problematic, especially if they are reused by someone else.

On the other hand, IDs are a pain to work with if you are creating users in advance and not using the `create` feature of the module.

You can set the `match` option for any strategy to one of the following choices:

#### `id`

Matches on the id of their profile as returned by the strategy module. This is most unique, however if you don't set `create`, then you'll need to find out the ids of users in advance and populate them in your database. You could do that by adding a string field to the `fields` configuration of the `@apostrophecms/user` module in your project.

To accommodate multiple strategies, If the strategy name is `google`, then the id needs to be in the `googleId` field of the user. If the strategy name is `gitlab`, the id needs to be in `gitlabId`, and so on. If you are using the `create` feature, these properties are automatically populated for you.

**The strategy name and the npm module name are not quite the same thing.** Look at the output of `node app @apostrophecms/passport-bridge:list-urls`. The word that follows `/auth` is the strategy name.

#### `email`

This will match on any email the authentication provider indicates they own, whether it is an array in the `.emails` property of their profile containing objects with `.value` properties (as with Google), an array of strings in `.emails`, or just an `email` string property. *To minimize confusion you can also set `match` to `emails` which has the same effect. Either way it will check all three cases.*

#### `username`

The default. Users are matched based on having the same username.

#### A function of your choice

If you provide a function rather than a string, it will receive the user's profile from the passport strategy, and must return a MongoDB criteria object matching the appropriate user. Do not worry about checking the `disabled` or `type` properties, Apostrophe will handle that.

### How can I reject users in a customized way?

You can set your own policy for rejecting users by passing an `accept` function for any strategy. This function takes the `profile` object provided by the passport strategy and must return `true` otherwise the user is not permitted to log in.

### How can I lock down my site by email address domain name?

You may wish to accept only users from one email domain, which is very handy if your company's email is hosted by Google (aka "G Suite", aka "Google Workspaces"). For that, also set the `emailDomain` option to the domain name you wish to allow. All others are rejected. This is very important if you are using the `create` option.

### How can I reject direct logins via Apostrophe's login form?

"This is great, but I want to disable the regular `/login` page." You can:

```javascript
// in app.js
modules: {
  '@apostrophecms/passport-bridge': {
    // As above; this is not where we disable local login...
  },
  '@apostrophecms/login': {
    // We disable it here, by configuring the built-in @apostrophecms/login module
    localLogin: false
  }
}
```

The built-in login page is powered by Passport's `local` strategy, which is added to Apostrophe by the standard `@apostrophecms/login` module. That's why we disable it there and not in `@apostrophecms/passport-bridge`'s options.

### How can I override the error page?

If login fails, for instance because you are matching on `email` but the `username` duplicates another account, or because a user is valid in Google but `emailDomain` does not match, the `error.html` template of the `apostrophe-passport` module is rendered. By default, it works, but it's pretty ugly! You'll want to customize it to your project's needs.

Like other templates in Apostrophe, you can override this template by copying it to `modules/@apostrophecms/passport-bridge/views/error.html` *in your project* (**never modify the npm module itself**). You can then extend your own layout template and so on, just as you have most likely already done for the 404 Not Found page.

### How can I redirect the standard `/login` page to one of my strategies?

Once you have disabled the regular login page, it's possible for you to decide what happens at that URL. Use the [@apostrophecms/redirect](https://npmjs.org/package/@apostrophecms/redirect) module to set it up through a nice UI, or add an Express route and a redirect in your own code.

### What if it doesn't work?

Feel free to open an issue but be sure to provide full specifics and a test project. Note that some strategies may not follow the standard practices this module is built upon. Those written by Jared Hanson, the author of Passport, or following his best practices should work well. You might want to test directly with the sample code provided with that strategy module first, to rule out problems with the module or with your configuration of it.

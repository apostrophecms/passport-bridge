# Changelog

## 1.2.0 - 2023-03-24

* Add logging of passport error details.

## 1.1.1 - 2023-02-14

* Corrected a bug that prevented `retainAccessTokenInSession` from working properly. Note that this option can only work with Passport strategies that honor the `passReqToCallback: true` option (passed for you automatically). Strategies derived from `passport-oauth2`, such as `passport-github` and many others, support this and others may as well.

## 1.1.0 - 2023-02-01

Setting the `retainAccessTokenInSession` option to `true` retains the `accessToken` and `refreshToken` provided by passport in `req.session.accessToken` and `req.session.refreshToken`. Depending on your oauth authentication scope, this makes it possible to carry out API calls on the user's behalf when authenticating with github, gmail, etc. If you need to refresh the access token, you might try the [passport-oauth2-refresh](https://www.npmjs.com/package/passport-oauth2-refresh) module.

## 1.0.0 - 2023-01-16

Declared stable. No code changes.

## 1.0.0-beta - 2022-01-06

Initial release for A3. Tested and working with Google and Okta. Other standard passport modules should also work, especially those based on OpenAuth.


# Changelog

## UNRELEASED

* Use `self.apos.root.import` instead of `self.apos.root.require`.
* `enablePassportStrategies` is now async.

## 1.2.1 (2024-10-03)

* Adds translation strings.

## 1.2.0 - 2023-06-08

* Support for making "connections" to secondary accounts. For instance, a user whose primary account login method is email can connect
their account to a github account when the appropriate features are active as described in the documentation.
* Accept `scope` either as an `option` of the strategy, or as an `authenticate` property for the strategy, and
pass it on to the strategy in both ways, as well as to both the login and callback routes. This allows `passport-github2`
to capture the user's private email address correctly, and should help with other differences between strategies as well.
* Back to using upstream `passport-oauth2-refresh` now that our PR has been accepted (thanks).

## 1.2.0-alpha.4 - 2023-04-07

* More dependency games.

## 1.2.0-alpha.3 - 2023-04-07

* Depend on a compatible temporary fork of `passport-oauth2-refresh`.

## 1.2.0-alpha.2 - 2023-04-07

* Introduced the new `retainAccessToken` option, which retains tokens in Apostrophe's
"safe" where they can be used for longer than a single Apostrophe session. Please note
that `retainAccessTokenInSession` is now deprecated, as it cannot work with Passport 0.6
as found in current Apostrophe 3.x due to upstream changes. See the README for
more information about the new approach. You only need this option if you want to
call additional APIs of the provider, for instance github APIs for those using
`passport-github`.
* Introduced convenience methods to use the access token in such a way that it is
automatically refreshed if necessary.

## 1.1.1 - 2023-02-14

* Corrected a bug that prevented `retainAccessTokenInSession` from working properly. Note that this option can only work with Passport strategies that honor the `passReqToCallback: true` option (passed for you automatically). Strategies derived from `passport-oauth2`, such as `passport-github` and many others, support this and others may as well.

## 1.1.0 - 2023-02-01

Setting the `retainAccessTokenInSession` option to `true` retains the `accessToken` and `refreshToken` provided by passport in `req.session.accessToken` and `req.session.refreshToken`. Depending on your oauth authentication scope, this makes it possible to carry out API calls on the user's behalf when authenticating with github, gmail, etc. If you need to refresh the access token, you might try the [passport-oauth2-refresh](https://www.npmjs.com/package/passport-oauth2-refresh) module.

## 1.0.0 - 2023-01-16

Declared stable. No code changes.

## 1.0.0-beta - 2022-01-06

Initial release for A3. Tested and working with Google and Okta. Other standard passport modules should also work, especially those based on OpenAuth.

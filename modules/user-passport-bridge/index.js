module.exports = {
  improve: '@apostrophecms/user',
  methods(self) {
    return {
      // Resolves to `{ accessToken, refreshToken }`, or `null` if
      // none are available for the given passport strategy.
      async getTokens(user, strategy) {
        if ((!user) || (!user._id)) {
          throw self.apos.error('error', 'First argument must be an apostrophe user object');
        }
        if (!strategy) {
          throw self.apos.error('error', 'Second argument must be a passport strategy name');
        }
        const info = await self.safe.findOne({
          _id: user._id
        });
        if (!info) {
          // Should never happen
          throw self.apos.error('error', 'User has no entry in the safe');
        }
        const tokens = info.passportTokens;
        if (!tokens) {
          return null;
        }
        const strategyTokens = tokens[strategy];
        if (!strategyTokens) {
          return null;
        }
        return strategyTokens;
      },
      async updateTokens(user, strategy, { accessToken, refreshToken }) {
        await self.safe.updateOne({
          _id: user._id
        }, {
          $set: {
            [`tokens.${strategy}`]: {
              accessToken,
              refreshToken
            }
          }
        });
      },
      async refreshTokens(user, strategy, refreshToken) {
        const originalRefreshToken = refreshToken;
        if (!refreshToken) {
          ({ refreshToken }) = await self.getTokens(user, strategy);
        }
        const refresh = self.apos.modules['@apostrophecms/passport-bridge'].refresh;
        return new Promise((resolve, reject) => {
          return refresh(
            strategy,
            refreshToken,
            async (err, accessToken, refreshToken) => {
              if (err) {
                return reject(err);
              }
              let newRefreshToken = refreshToken || originalRefreshToken;
              try {
                await self.updateTokens(user, strategy, {
                  accessToken,
                  refreshToken: newRefreshToken
                });
              } catch (e) {
                return reject(e);
              }
              return resolve({
                accessToken,
                refreshToken: newRefreshToken
              });
            }
          );
        });
      },
      async withAccessToken(user, strategy, fn) {
        let accessToken, refreshToken;
        try {
          ({ accessToken, refreshToken }) = await self.getTokens(user, strategy);
          return await fn(accessToken);
        } catch (e) {
          if (e.status && e.status === 401) {
            const { accessToken } = await self.refreshTokens(user, strategy, refreshToken);
            // On the second try, failure is failure
            return fn(accessToken);
          } else {
            // Unrelated error
            throw e;
          }
        }
      }
    };
  }
};
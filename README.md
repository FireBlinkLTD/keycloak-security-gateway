# fireblink/keycloak-security-gateway

[![CircleCI](https://circleci.com/gh/FireBlinkLTD/keycloak-security-gateway.svg?style=svg)](https://circleci.com/gh/FireBlinkLTD/keycloak-security-gateway)
[![codecov](https://codecov.io/gh/FireBlinkLTD/keycloak-security-gateway/branch/master/graph/badge.svg)](https://codecov.io/gh/FireBlinkLTD/keycloak-security-gateway)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/FireBlinkLTD/keycloak-security-gateway.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/FireBlinkLTD/keycloak-security-gateway/context:javascript)
[![Greenkeeper badge](https://badges.greenkeeper.io/FireBlinkLTD/keycloak-security-gateway.svg)](https://greenkeeper.io/)

Node.js based proxy service to secure applications and integrate with Keycloak SSO flow with extra cool benefits:

| Feature                                                                               | fireblink/keycloak-security-gateway | keycloak/keycloak-gatekeeper                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Ability to use internal to cluster Keycloak address for API integration               | Yes                                 | No                                                                    |
| Use SSO flow for UI endpoints only                                                    | Yes                                 | No                                                                    |
| Redirect to custom address upon logout                                                | Yes                                 | No                                                                    |
| Ability to specify target interface to listen incomming connections                   | Yes                                 | No                                                                    |
| Specify custom Cookie names                                                           | Yes                                 | No                                                                    |
| JWT online verification stratagy                                                      | Yes                                 | No                                                                    |
| Flexible role based access (like: at least one of the roles required, not simply all) | Yes                                 | Yes (either all or at least one, but not both rules at the same time) |
| Multiple KC clients supported                                                         | Yes                                 | No                                                                    |

## Configuration

### Environment variables

- `APP_PORT` - Application port
- `APP_INTERFACE` - Interface to listen incomming connections, e.g. `0.0.0.0` to accept all, `127.0.0.1` to accept localhost only
- `APP_HOST` - Ingress host name associated with service
- `APP_LOG_LEVEL` - Log level, `debug`, `info`, `error`

- `APP_KEYCLOAK_CLIENTS` - JSON array of objects that represent Keycloak [Client Configuration](#client-configuration)

- `APP_UPSTREAM_URL` - Upstream URL to forward requests to
- `APP_LOGOUT_REDIRECT_URL` - URL or relative path to redirect user after logout. User can provide a query parameter `redirectTo` to override this setting on per request level.

- `APP_PATHS_CALLBACK` - Routing path to use for SSO authentication callback, e.g. `/oauth/callback`
- `APP_PATHS_LOGOUT` - Logout path to use, e.g. `/logout`
- `APP_PATHS_HEALTH` - Gateway health endpoint, e.g. `/healthz`

- `APP_COOKIE_SECURE` - Either cookies should be used only with HTTPS connection
- `APP_COOKIE_ACCESS_TOKEN` - Access Token cookie name
- `APP_COOKIE_REFRESH_TOKEN` - Refresh Token cookie name

- `APP_JWT_VERIFICATION_MODE` - JWT verification mode, either `ONLINE` or `OFFLINE`
- `APP_RESOURCES` - JSON array of objects that represent [Resource Configuration](#resource-configuration)
- `APP_HEADERS` - JSON formatted key-value object of extra headers to add, value can be EJS template

## Configuration Defintions

### Client Configuration

```yaml
clientId: test
secret: 9067b642-015a-441a-816b-0c8d19305d10
realmURL:
  public: https://keycloak.example.com/auth/realms/master
  private: http://keycloak.local:8080/auth/realms/master
```

### Resource Configuration

```yaml
# [required] RegExp pattern to match the request path
match: /a/(.*)

# [optional]
# If true - request will be considered for frontend application and will cause SSO flow to trigger
# If not - 401 will be simply returned and it is up to frontend application to reload page
ssoFlow: false

# [optional] if ssoFlow is enabled this field is mandatory
# Identifies what client_id to use for SSO authentication flow
clientId: test-client

# [optional] list of HTTP methods to match, note: if not provided application will match all methods
methods:
  - GET
  - POST

# [optional] override path before making a proxy call to upstream server
override: /b/$1

# [optional] skip JWT verification and allow public access to the resource
public: false

# [optional] roles to verify the JWT with
roles:
  # [optional] all specified roles below JWT should have
  all:
    - realm_rome
    - client_id:client_role

  # [optional] at least one of the roles specified below should be inclued in JWT
  any:
    - another_realm_rome
    - client_id:another_client_role
```

## JWT Verification Modes

Gatekeeper can validate JWT for each request in 2 different ways:

### Offline Verification

Most common scenario to use. Fast, but if session get revoked on Keycloak side user will still be able to use application till token will not expire.

### Online Verification

Slow, as every request will be verified with Keycloak, however guarantees that if session get revoked - user will not have access to application any longer.

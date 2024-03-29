# [DEPRECATED]

This project is deprecated. Please consider using [https://github.com/FireBlinkLTD/prxi-openid-connect](https://github.com/FireBlinkLTD/prxi-openid-connect) instead.

# fireblink/keycloak-security-gateway

[![CircleCI](https://circleci.com/gh/FireBlinkLTD/keycloak-security-gateway.svg?style=svg)](https://circleci.com/gh/FireBlinkLTD/keycloak-security-gateway)
[![codecov](https://codecov.io/gh/FireBlinkLTD/keycloak-security-gateway/branch/master/graph/badge.svg)](https://codecov.io/gh/FireBlinkLTD/keycloak-security-gateway)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/FireBlinkLTD/keycloak-security-gateway.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/FireBlinkLTD/keycloak-security-gateway/context:javascript)
[![Greenkeeper badge](https://badges.greenkeeper.io/FireBlinkLTD/keycloak-security-gateway.svg)](https://greenkeeper.io/)

Node.js based reverse proxy designed to secure applications by providing Keycloak SSO integration and JWT verification.

## Common Architecture Diagram

Note: this is just one common way of how keycloak-security-gateway service can be used, in a very complex service mesh there might be more than one keycloak-security-gateway.

![Architecture Diagram](./assets/mesh.png)

keycloak-security-gateway can be used to secure any kind of app, either it is a web page or a service that exposes APIs. In case of UI apps gateway will provide SSO integration and for APIs it will provide JWT verification (both online and offline). Of cource, RBAC is supported.

## SSO Flow Sequence Diagram.

![SSO Flow](./assets/sso.png)

## What are the differences with Keycloak's Gatekeeper?

| Feature                                                                               | fireblink/keycloak-security-gateway | keycloak/keycloak-gatekeeper                                          |
| ------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Ability to use internal to the cluster Keycloak address for API integration           | Yes                                 | No                                                                    |
| Use SSO flow for the UI endpoints only                                                | Yes                                 | No                                                                    |
| Redirect to the custom address upon logout                                            | Yes                                 | No                                                                    |
| Ability to specify the target interface to listen incomming connections               | Yes                                 | No                                                                    |
| Ability to specify custom Cookie names                                                | Yes                                 | No                                                                    |
| JWT online verification strategy                                                      | Yes                                 | No                                                                    |
| Flexible role based access (like: at least one of the roles required, not simply all) | Yes                                 | Yes (either all or at least one, but not both rules at the same time) |
| Multiple KC clients supported                                                         | Yes                                 | No                                                                    |
| Roles endpoint to get all roles from JWT token (no need to parse JWT on SPA side)     | Yes                                 | No                                                                    |

## Configuration

### Environment variables

- `APP_PORT` - Application port
- `APP_INTERFACE` - Interface to listen incomming connections, e.g. `0.0.0.0` to accept all, `127.0.0.1` to accept localhost only
- `APP_HOST` - Ingress host name associated with service
- `APP_LOG_LEVEL` - Log level, `debug`, `info`, `error`

- `APP_KEYCLOAK_CLIENTS` - JSON/YAML array of objects that represent Keycloak [Client Configuration](#client-configuration)

- `APP_UPSTREAM_URL` - Upstream URL to forward requests to
- `APP_LOGOUT_REDIRECT_URL` - URL or relative path to redirect user after logout. User can provide a query parameter `redirectTo` to override this setting on per request level.

- `APP_PATHS_ACCESS` - Access verification endpoint path. Endpoint allows to check if client has access to specific resource, e.g. `/oauth/access`
- `APP_PATHS_CALLBACK` - Routing path to use for SSO authentication callback, e.g. `/oauth/callback`
- `APP_PATHS_LOGOUT` - Logout path to use, e.g. `/oauth/logout`
- `APP_PATHS_HEALTH` - Gateway health endpoint, e.g. `/healthz`
- `APP_PATHS_ROLES` - Roles endpoint, e.g. `/oauth/roles`, endpoint extracts all roles from JWT including realm and client ones and returns all as single JSON array.

- `APP_COOKIE_SECURE` - Either cookies should be used only with HTTPS connection
- `APP_COOKIE_ACCESS_TOKEN` - Access Token cookie name
- `APP_COOKIE_REFRESH_TOKEN` - Refresh Token cookie name

- `APP_JWT_VERIFICATION_MODE` - JWT verification mode, either `ONLINE` or `OFFLINE`
- `APP_RESOURCES` - JSON/YAML array of objects that represent [Resource Configuration](#resource-configuration)
- `APP_REQUEST_HEADERS` - JSON/YAML formatted key-value object of extra headers to add/override before sending request to upstream service, value can be EJS template
- `APP_RESPONSE_HEADERS` - JSON/YAML formatted key-value object of extra headers to add/override before sending request to a client

## Configuration Definitions

### Client Configuration

```yaml
# [required] Secondary identify, should be unique across all client configurations, used to match inside resource definitions
sid: master-test

# [optional] Keycloak's Client "client_id" value
# Note: either clientId or clientIdEnv is required
clientId: test

# [optional] Environment variable name to extract clientId value from
# Note: either clientId or clientIdEnv is required
clientIdEnv: KEYCLOAK_TEST_CLIENT_NAME

# [optional] Keycloak's Client "client_secret" value
# Note: either secret or secretEnv is required
secret: 9067b642-015a-441a-816b-0c8d19305d10

# [optional] Environment variable name to extract client_secret value from
# Note: either secret or secretEnv is required
secretEnv: KEYCLOAK_TEST_CLIENT_SECRET

# [required] Keycloak Realm URLs
realmURL:
  # [required] Public facing URL (used to redirect client in SSO flow)
  public: https://keycloak.example.com/auth/realms/master

  # [required] Private URL (used for API integration)
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
# Identifies what client configuration to use for SSO authentication flow (should match "sid" field)
clientSID: test-client

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

## Troubleshooting

### User has role, but still could not access resource.

Make sure client has all the necessary roles included in the scope, or "Full Scope Allowed" toggle is turned on.

## Endpoints

### Access Endpoint

Allows to check if client can access specified resource(s).

Request requires `resource` query parameters to be provided. Value should be a comma separated pairs of method and resource path.

Examples values:

- `GET:/api` - single resource to check for HTTP method `GET` and path `/api`
- `GET:/api,POST:/api/user` - multiple resources to check

Response is an object of all requested paths and boolean value identifying that resource can be accessed or not:

```json
{
  "GET:/api": true,
  "POST:/api/user": false
}
```

### Roles Endpoint

Allows to retrieve all the roles JWT contains. Can be used by client application, though it is recommended to use access endpoint to check individual endpoints for access instead.

Response example:

```json
["realm_role", "client_id:client_role"]
```

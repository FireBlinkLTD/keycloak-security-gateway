# fireblink/keycloak-security-gateway

[![Greenkeeper badge](https://badges.greenkeeper.io/FireBlinkLTD/keycloak-security-gateway.svg)](https://greenkeeper.io/)

Node.js based proxy service to secure applications and integrate with Keycloak SSO flow with extra cool benefits:

| Feature                                                                           | fireblink/keycloak-security-gateway | keycloak/keycloak-gatekeeper |
| --------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| Ability to use internal to cluster Keycloak address for API integration           | Yes                                 | No                           |
| Use SSO flow for UI endpoints only                                                | Yes                                 | No                           |
| Redirect to custom address upon logout                                            | Yes                                 | No                           |
| Ability to specify target interface to listen incomming connections               | Yes                                 | No                           |
| Specify custom Cookie names                                                       | Yes                                 | No                           |
| JWT online verification stratagy                                                  | Yes                                 | No                           |
| Flexible role based access (like: at least one of roles required, not simply all) | Yes                                 | No                           |

## Configuration

### Environment variables

- `APP_PORT` - Application port
- `APP_INTERFACE` - Interface to listen incomming connections, e.g. `0.0.0.0` to accept all, `127.0.0.1` to accept localhost only
- `APP_HOST` - Ingress host name associated with service
- `APP_LOG_LEVEL` - Log level, `debug`, `info`, `error`

- `APP_KEYCLOAK_CLIENT_ID` - Keycloak's client clientId
- `APP_KEYCLOAK_CLIENT_SECRET` - Keycloak's client secret
- `APP_KEYCLOAK_PUBLIC_REALM_URL` - Keycloak's realm URL (public facing, used for SSO redirects), e.g: `https://keycloak.example.com/auth/realms/master`
- `APP_KEYCLOAK_PRIVATE_REALM_URL` - Keycloak's realm URL (local DNS, used for API integration), e.g: `http://keycloak.default.svc.cluster.local:8080/auth/realms/master`
- `APP_KEYCLOAK_SCOPES` - Additional client scopes in JSON string, e.g. `["openvpn","other"]`

- `APP_UPSTREAM_URL` - Upstream URL to forward requests to
- `APP_LOGOUT_REDIRECT_URL` - URL or relative path to redirect user after logout

- `APP_PATHS_CALLBACK` - Routing path to use for SSO authentication callback, e.g. `/oauth/callback`
- `APP_PATHS_LOGOUT` - Logout path to use, e.g. `/logout`
- `APP_PATHS_HEALTH` - Gateway health endpoint, e.g. `/healthz`

- `APP_COOKIE_SECURE` - Either cookies should be used only with HTTPS connection
- `APP_COOKIE_ACCESS_TOKEN` - Access Token cookie name
- `APP_COOKIE_REFRESH_TOKEN` - Refresh Token cookie name

- `APP_JWT_VERIFICATION_MODE` - JWT verification mode, either `ONLINE` or `OFFLINE`
- `APP_RESOURCES` - JSON formatted configuration for resource matching

## Resources Configuration

```yaml
# [required] RegExp pattern to match the request path
match: /a/(.*)

# [optional]
# If true - request will be considered for frontend application and will cause SSO flow to trigger
# If not - 401 will be simply returned and it is up to frontend application to reload page
ssoFlow: false

# [optional] list of HTTP methods to match, note: if not provided application will match all methods
methods:
  - GET
  - POST

# [optional] override path before making a proxy call to upstream server
override: /b/$1

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

### Offline validation

Most common scenario to use. Fast, but if session get revoked on Keycloak side user will still be able to use application till token will not expire.

### Online validation

Slow, as every request will be verified with Keycloak, however guarantees that if session get revoked - user will not have access to application any longer.

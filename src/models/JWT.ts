import { $log } from 'ts-log-debug';

export class JWT {
    token: string;
    realm!: string;

    header: any;
    payload: {
        iss: string;
        azp: string;
        exp: number;
        preferred_username?: string;
        email?: string;
        resource_access?: {
            [clientId: string]: {
                roles: string[];
            };
        };
        realm_access?: {
            roles: string[];
        };
        [key: string]: any;
    };
    signature!: Buffer;
    signed!: string;

    constructor(token: string) {
        this.token = token;

        try {
            const parts = token.split('.');
            this.header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            this.payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

            if (this.payload.iss && this.payload.iss.indexOf('/auth/realms/') > 0) {
                this.realm = this.payload.iss.split('/auth/realms/')[1];
            }

            this.signature = Buffer.from(parts[2], 'base64');
            this.signed = parts[0] + '.' + parts[1];
        } catch (err) {
            this.payload = {
                iss: '',
                azp: '',
                exp: 0,
            };
        }
    }

    /**
     * @return {boolean}
     */
    isExpired(): boolean {
        return this.payload.exp * 1000 < Date.now();
    }

    /**
     * Verify roles
     */
    verifyRoles(roles: { any?: string[]; all?: string[] }): boolean {
        if (roles.all) {
            for (const role of roles.all) {
                if (!this.hasRole(role)) {
                    $log.debug(`Missing role in JWT: ${role}`);

                    return false;
                }
            }

            $log.debug('Roles from "all" block are matched');
        }

        if (roles.any && roles.any.length) {
            for (const role of roles.any) {
                if (this.hasRole(role)) {
                    $log.debug(`Found role in JWT: ${role}`);

                    return true;
                }
            }

            $log.debug(`No roles matching any in JWT were found.`);

            return false;
        }

        return true;
    }

    /**
     * Get all roles
     */
    getAllRoles(): string[] {
        const result: string[] = [];

        if (this.payload.resource_access) {
            for (const clientId of Object.keys(this.payload.resource_access)) {
                if (this.payload.resource_access[clientId].roles) {
                    for (const role of this.payload.resource_access[clientId].roles) {
                        result.push(clientId + ':' + role);
                    }
                }
            }
        }

        if (this.payload.realm_access && this.payload.realm_access.roles) {
            result.push(...this.payload.realm_access.roles);
        }

        return result;
    }

    /**
     * Check if JWT has role
     * Examples:
     *  - realm_role - for realm level
     *  - client_id:client_role - for client level
     */
    hasRole(roleName: string): boolean {
        if (roleName.indexOf(':') < 0) {
            return this.hasRealmRole(roleName);
        } else {
            const parts = roleName.split(':');

            return this.hasClientRole(parts[0], roleName.substring(parts[0].length + 1));
        }
    }

    /**
     * Check if JWT has client role
     */
    private hasClientRole(clientId: string, roleName: string): boolean {
        if (!this.payload.resource_access) {
            return false;
        }

        const appRoles = this.payload.resource_access[clientId];

        if (!appRoles) {
            return false;
        }

        return appRoles.roles.indexOf(roleName) >= 0;
    }

    /**
     * Check if JWT has realm role
     */
    private hasRealmRole(roleName: string): boolean {
        if (!this.payload.realm_access || !this.payload.realm_access.roles) {
            return false;
        }

        return this.payload.realm_access.roles.indexOf(roleName) >= 0;
    }
}

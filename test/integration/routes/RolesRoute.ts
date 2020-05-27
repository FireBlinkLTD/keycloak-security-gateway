import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import axios from 'axios';
import { strictEqual, ok } from 'assert';
import { start, stop } from '../../../src';
import { IClientConfiguration } from '../../../src/interfaces/IClientConfiguration';
import { stringify } from 'querystring';

const clients: IClientConfiguration[] = get('keycloak.clients');

@suite()
class RolesRoute {
    async before() {
        await start();
    }

    async after() {
        await stop();
    }

    @test()
    async makeRolesRequest() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get(get('paths.roles'), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        ok(response.data.indexOf('test:uma_protection') >= 0);
        ok(response.data.indexOf('offline_access') >= 0);
    }

    @test()
    async makeUnauthorizedRolesRequest() {
        const request = axios.create({
            baseURL: get('host'),
        });

        let code = 0;
        try {
            await request.get(get('paths.roles'));
        } catch (e) {
            code = e.response.status;
        }

        strictEqual(code, 401);
    }

    /**
     * Authenticate with service account
     */
    private async getAccessToken(): Promise<string> {
        console.log('-> Retrieving access_token from KC...');
        const request = axios.create({
            baseURL: clients[0].realmURL.private,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const result = await request('/protocol/openid-connect/token', {
            method: 'POST',
            data: stringify({
                grant_type: 'client_credentials',
                client_id: 'test',
                client_secret: clients[0].secret,
            }),
        });

        console.log(`-> Access token: ${result.data.access_token}`);

        return result.data.access_token;
    }
}

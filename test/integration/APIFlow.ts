import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import { start, stop } from '../../src';
import { createServer, Server, IncomingHttpHeaders } from 'http';
import axios from 'axios';
import { deepStrictEqual, strictEqual } from 'assert';
import { stringify } from 'querystring';
const clients: { [clientId: string]: string } = get('keycloak.clients');

@suite()
class APIFlow {
    private server: Server;

    private lastRequestHeaders: IncomingHttpHeaders;

    async before() {
        await start();

        await new Promise(resolve => {
            this.server = createServer((req, res) => {
                this.lastRequestHeaders = req.headers;
                res.statusCode = 200;
                res.setHeader('content-type', 'application/json');
                res.write('{"success":true}', () => {
                    res.end();
                });
            });

            this.server.listen(7777, '0.0.0.0', () => {
                resolve();
            });
        });
    }

    async after() {
        await stop();
        this.server.close();
        this.server = null;
    }

    @test()
    async flow() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get('/api', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        deepStrictEqual(response.data, {
            success: true,
        });

        strictEqual(this.lastRequestHeaders['x-test'], 'true');
    }

    /**
     * Authenticate with service account
     */
    private async getAccessToken(): Promise<string> {
        console.log('-> Retrieving access_token from KC...');
        const request = axios.create({
            baseURL: get('keycloak.realmURL.private'),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const result = await request('/protocol/openid-connect/token', {
            method: 'POST',
            data: stringify({
                grant_type: 'client_credentials',
                client_id: 'test',
                client_secret: clients.test,
            }),
        });

        console.log(`-> Access token: ${result.data.access_token}`);

        return result.data.access_token;
    }
}

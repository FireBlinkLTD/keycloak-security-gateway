import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import { start, stop } from '../../src';
import { createServer, Server, IncomingHttpHeaders } from 'http';
import axios from 'axios';
import { deepStrictEqual, strictEqual } from 'assert';
import { BaseSuite } from './BaseSuite';

@suite()
class APIFlow extends BaseSuite {
    private server: Server;

    private lastRequestHeaders: IncomingHttpHeaders;

    async before() {
        await start();

        await new Promise((resolve) => {
            this.server = createServer((req, res) => {
                this.lastRequestHeaders = req.headers;
                res.statusCode = 200;
                res.setHeader('content-type', 'application/json');
                res.setHeader('x-override', Date.now().toString());
                res.setHeader('x-remove', Date.now().toString());

                res.write(
                    JSON.stringify({
                        success: true,
                        url: req.url,
                    }),
                    () => {
                        res.end();
                    },
                );
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

        const response = await request.get('/api?queryString=yes', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        deepStrictEqual(response.data, {
            success: true,
            url: '/api?queryString=yes',
        });

        strictEqual(this.lastRequestHeaders['x-test'], 'true');
        strictEqual(response.headers['x-response-test'], 'test');
        strictEqual(response.headers['x-override'], 'new-value');
        strictEqual(response.headers['x-remove'], undefined);
    }

    @test()
    async missingResourceMapping() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        try {
            await request.get('/_missing_', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            throw new Error('Should never be called');
        } catch (err) {
            strictEqual(err.response.status, 404);
        }
    }

    @test()
    async missingRequiredRoleInJWT() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        try {
            await request.get('/api/missing/role', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            throw new Error('Should never be called');
        } catch (err) {
            strictEqual(err.response.status, 403);
        }
    }

    @test()
    async invalidClientSID() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        try {
            await request.get('/invalid-client-sid', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            throw new Error('Should never be called');
        } catch (err) {
            strictEqual(err.response.status, 500);
        }
    }
}

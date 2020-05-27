import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import axios from 'axios';
import { strictEqual, ok } from 'assert';
import { start, stop } from '../../../src';
import { BaseSuite } from '../BaseSuite';

@suite()
class RolesRoute extends BaseSuite {
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
}

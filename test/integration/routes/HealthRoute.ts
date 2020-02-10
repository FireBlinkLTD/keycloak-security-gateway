import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import axios from 'axios';
import { strictEqual } from 'assert';
import { start, stop } from '../../../src';

@suite()
class HealthRoute {
    async before() {
        await start();
    }

    async after() {
        await stop();
    }

    @test()
    async makeHealthRequest() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const response = await request.get(get('paths.health'));
        strictEqual(response.data.ready, true);
    }
}

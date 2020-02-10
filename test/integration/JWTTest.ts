import { suite, test } from 'mocha-typescript';
import { strictEqual } from 'assert';
import { JWT } from '../../src/models/JWT';

const token =
    'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJwczB4YVB5TE5UMFpXSGNsOTg0d2EwVzJ6M0RKUGh5dzVXUVYtRnRtc213In0.eyJqdGkiOiJkNjc4NmEyMy04NWVlLTQ4YjktYTNjMy1iY2Q3Mzc5M2I5ODIiLCJleHAiOjE1ODEwODQ0MzgsIm5iZiI6MCwiaWF0IjoxNTgxMDg0MTM4LCJpc3MiOiJodHRwOi8va2V5Y2xvYWs6ODA4MC9hdXRoL3JlYWxtcy9sb2NhbCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiIwN2U2ZTUwOC02YzBjLTQ3YTEtYWY5My0wMTc1ZWExNjA4MmQiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJ0ZXN0IiwiYXV0aF90aW1lIjoxNTgxMDg0MTM3LCJzZXNzaW9uX3N0YXRlIjoiMWY5YmM3MDktYjFkYi00MzUxLWIxZGYtZjVhZjZkNDk5MTIzIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJodHRwOi8vMTI3LjAuMC4xOjg4ODgiXSwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbInJlYWxtX3JvbGUiLCJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsidGVzdCI6eyJyb2xlcyI6WyJ0ZXN0Il19LCJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6Im9wZW5pZCBlbWFpbCBwcm9maWxlIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJKb2huIERvZSIsInByZWZlcnJlZF91c2VybmFtZSI6InRlc3QiLCJnaXZlbl9uYW1lIjoiSm9obiIsImZhbWlseV9uYW1lIjoiRG9lIiwiZW1haWwiOiJqb2huQGRvbWFpbi5jb20ifQ.K5caO2RCLgncWN-iQb7WfxV6FU9_p4W7rcqfsQey0nh3f-93Dk2rmE7_3ZwE-0JAumgnxy2rBkqRJKSsp5f6QhAl9t3jmaKYR12V9G2FXRaSiD2N_g-jkcJaz84vRPUT-9EtrsK1YUL49-xxXYypJUn9QrLZ71RkkX6-9el9AX6NcaIQyqDfHKoflHi6r8Hlu2bdBQyvJKUDFwbKyb8866_j9Ord5nsRseMY22jH_L0gl79DmAC68gTFII_lYh1OybtRXWVdothta3XC_FCi7apNCYNpYAwS-FFll9ELuWGQDdIC9ZweimIQGfePRfjRaWfqXAifKIuANDgTTgzzxg';

@suite()
class JWTTest {
    @test()
    async verifyRoles() {
        const jwt = new JWT(token);

        const missingClientRole = jwt.hasRole('none:none');
        const missingRealmRole = jwt.hasRole('none');

        strictEqual(missingClientRole, false);
        strictEqual(missingRealmRole, false);

        const matchAnyMissingRole = jwt.verifyRoles({
            any: ['none:none'],
        });
        strictEqual(matchAnyMissingRole, false);
    }
}

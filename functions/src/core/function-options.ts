import {setGlobalOptions} from "firebase-functions/v2";

setGlobalOptions({maxInstances: 1, cpu: 0.08, concurrency: 1, region: "us-east1"});

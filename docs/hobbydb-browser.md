# hobbyDB browser integration — prepared, inactive

The private Express server now supports POST /api/hobbydb with existing Firebase owner authentication and request rate limiting. It starts one asynchronous TinyFish browser run, opens the exact variant and clicks Price Guide. It validates the returned number, variant, item URL and literal Estimated Value text. Search snippets from hobbyDB are replaced by this result when the reader is enabled. eBay and StockX remain orientative.

Server configuration: TINYFISH_API_KEY (secret), HOBBYDB_BROWSER_ENABLED=true. Production also requires the existing FIREBASE_PROJECT_ID, OWNER_UID and APP_ORIGIN settings. Frontend configuration: VITE_HOBBYDB_BROWSER_ENABLED=true and VITE_API_BASE_URL pointing to the authenticated HTTPS server. Never use a VITE variable for the TinyFish secret.

The current Firebase workflow deploys static Hosting and Firestore rules only. Do not enable the frontend flag until this backend has been hosted and tested. No cloud billing or browser integration has been activated by this preparation.

Pending: API key provision, backend deployment location and billing, successful authorized hobbyDB access. The live chat browser trial encountered a persistent CAPTCHA and did not read the value. A key alone will not solve that restriction. Do not claim an end-to-end verified price until a real read succeeds.

Run local mocked tests with `node tests/hobbydb.mjs` and existing regression tests with `npm test`. Mocked $37 is test data, not a live verified quotation.

Creation is not retried on error. Polling requests use timeouts; the run is cancelled when a challenge is detected, polling fails or the polling budget expires. Cancellation failure is surfaced with the run ID. This is not a monetary spending cap; abrupt server termination or a lost creation response can leave a remote run active. Review TinyFish wallet and runs before activation.

Provider documentation: https://docs.tinyfish.ai/authentication and https://docs.tinyfish.ai/key-concepts/runs

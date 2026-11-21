# WorkGetsDone demo

Source code for the WorkGetsDone demo, a small CRM and project tracker that runs on
[MeroFoundry](https://merofoundry.com). The live demo is at
https://workgetsdone.staging.merofoundry.app and its data resets every hour.

## What is here

- `src/frontend/` is the React client and the service definitions that the demo runs. Its
  own README covers local review, tests and packaging.
- `src/design/` is the design spec, tokens and mockups the client was built from.

## What is not here

Build logs, verification evidence, deployment runbooks and the original legacy application
were left out.

Scripts under `src/frontend/scripts/` that sign in or deploy read their credentials from
local `.env-*` files, which are not part of this repository.

## License

MIT. See [LICENSE](LICENSE).

// Importing this module first refuses to run unless WGD_BASE is set explicitly and is not production (WGD_ALLOW_PROD=1 overrides).
const PROD_HOST = 'workgetsdone.merofoundry.app';
const base = process.env.WGD_BASE;
let host = '';
try { host = base ? new URL(base).host : ''; } catch { host = ''; }
if (!base || !host || (host === PROD_HOST && process.env.WGD_ALLOW_PROD !== '1')) {
  console.error(`Refusing to run: set WGD_BASE explicitly to the stage site (https://workgetsdone.staging.merofoundry.app). Production (${PROD_HOST}) also needs WGD_ALLOW_PROD=1. WGD_BASE=${base ?? '(unset)'}`);
  process.exit(2);
}
console.log(`Target: ${base}`);
export const guardedBase = base;

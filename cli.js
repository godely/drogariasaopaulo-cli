#!/usr/bin/env node
import { run } from 'paguemenos-cli/runner';
import { retailer } from './index.js';
run(retailer, process.argv.slice(2), 'drogariasaopaulo').catch(err => { console.error(err.message); process.exitCode = 2; });

// Vercel serverless entry point.
//
// Vercel runs this file for every request (vercel.json rewrites all paths
// here). The Nest app is compiled by `nest build` into dist/ first — tsc keeps
// the decorator metadata Nest's dependency injection needs — and is created
// once per warm instance, then reused for every request that instance serves.
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

let server;

async function createServer() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  configureApp(app);
  await app.init();
  return expressApp;
}

export default async function handler(req, res) {
  server ??= createServer().catch((err) => {
    server = undefined; // let the next request retry a failed cold start
    throw err;
  });
  const app = await server;
  app(req, res);
}

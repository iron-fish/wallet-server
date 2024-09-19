/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import {
  TsoaRoute,
  fetchMiddlewares,
  ExpressTemplateService,
} from "@tsoa/runtime";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { BlockController } from "./../controllers/block";
import type {
  Request as ExRequest,
  Response as ExResponse,
  RequestHandler,
  Router,
} from "express";

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
  Error: {
    dataType: "refObject",
    properties: {
      name: { dataType: "string", required: true },
      message: { dataType: "string", required: true },
      stack: { dataType: "string" },
    },
    additionalProperties: false,
  },
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {
  noImplicitAdditionalProperties: "throw-on-extras",
  bodyCoercion: true,
});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

export function RegisterRoutes(app: Router) {
  // ###########################################################################################################
  //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
  //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
  // ###########################################################################################################

  app.get(
    "/latest-block",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(
      BlockController.prototype.getLatestBlock,
    ),

    async function BlockController_getLatestBlock(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {};

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "getLatestBlock",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    "/note-witness",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(BlockController.prototype.noteWitness),

    async function BlockController_noteWitness(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {
        index: {
          in: "query",
          name: "index",
          required: true,
          dataType: "double",
        },
        confirmations: {
          in: "query",
          name: "confirmations",
          dataType: "double",
        },
      };

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "noteWitness",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    "/fee-rates",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(BlockController.prototype.feeRates),

    async function BlockController_feeRates(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {};

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "feeRates",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.post(
    "/transaction",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(
      BlockController.prototype.broadcastTransaction,
    ),

    async function BlockController_broadcastTransaction(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {
        transaction: {
          in: "body",
          name: "transaction",
          required: true,
          dataType: "string",
        },
        err: {
          in: "res",
          name: "400",
          required: true,
          dataType: "nestedObjectLiteral",
          nestedProperties: { reason: { dataType: "string", required: true } },
        },
      };

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "broadcastTransaction",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    "/block",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(BlockController.prototype.getBlock),

    async function BlockController_getBlock(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {
        err400: {
          in: "res",
          name: "400",
          required: true,
          dataType: "nestedObjectLiteral",
          nestedProperties: { reason: { dataType: "string", required: true } },
        },
        err404: {
          in: "res",
          name: "404",
          required: true,
          dataType: "nestedObjectLiteral",
          nestedProperties: { reason: { dataType: "string", required: true } },
        },
        hash: { in: "query", name: "hash", dataType: "string" },
        sequence: { in: "query", name: "sequence", dataType: "double" },
      };

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "getBlock",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    "/block-range",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(
      BlockController.prototype.getBlockRange,
    ),

    async function BlockController_getBlockRange(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {
        err400: {
          in: "res",
          name: "400",
          required: true,
          dataType: "nestedObjectLiteral",
          nestedProperties: { reason: { dataType: "string", required: true } },
        },
        err404: {
          in: "res",
          name: "404",
          required: true,
          dataType: "nestedObjectLiteral",
          nestedProperties: { reason: { dataType: "string", required: true } },
        },
        start: {
          in: "query",
          name: "start",
          required: true,
          dataType: "double",
        },
        end: { in: "query", name: "end", required: true, dataType: "double" },
      };

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "getBlockRange",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
  app.get(
    "/server-info",
    ...fetchMiddlewares<RequestHandler>(BlockController),
    ...fetchMiddlewares<RequestHandler>(
      BlockController.prototype.getServerInfo,
    ),

    async function BlockController_getServerInfo(
      request: ExRequest,
      response: ExResponse,
      next: any,
    ) {
      const args: Record<string, TsoaRoute.ParameterSchema> = {};

      // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

      let validatedArgs: any[] = [];
      try {
        validatedArgs = templateService.getValidatedArgs({
          args,
          request,
          response,
        });

        const controller = new BlockController();

        await templateService.apiHandler({
          methodName: "getServerInfo",
          controller,
          response,
          next,
          validatedArgs,
          successStatus: undefined,
        });
      } catch (err) {
        return next(err);
      }
    },
  );
  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

  // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

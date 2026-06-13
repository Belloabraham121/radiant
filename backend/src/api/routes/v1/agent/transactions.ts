import { Router } from "express";
import { ZodError } from "zod";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getTransaction,
  listTransactions,
} from "../../../../services/agent-transaction/agent-transaction.service.js";
import { listAgentTransactionsQuerySchema } from "../../../../services/agent-transaction/agent-transaction.types.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const agentTransactionsRouter = Router();

const transactionIdSchema = z.string().uuid();

agentTransactionsRouter.get("/api/v1/agent/transactions", requireAuth, async (req, res, next) => {
  try {
    const query = listAgentTransactionsQuerySchema.parse(req.query);
    const result = await listTransactions(req.user.privyUserId, query);

    return ok(req, res, {
      items: result.items,
      meta: {
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
        },
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: err.flatten(),
      });
    }
    next(err);
  }
});

agentTransactionsRouter.get(
  "/api/v1/agent/transactions/:id",
  requireAuth,
  async (req, res, next) => {
    try {
      const transactionId = transactionIdSchema.parse(req.params.id);
      const detail = await getTransaction(req.user.privyUserId, transactionId);
      return ok(req, res, detail);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid transaction id",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);

// Deliberately forbidden: a package reaching for a worker framework. ADR 0016
// keeps @nestjs/* under apps/worker/src, because a decorator in a module is how
// a module stops being portable — and how business rules start living in a
// framework class. scripts/dependency-boundaries.mjs asserts this is detected.
import { Injectable } from "@nestjs/common";

export const marker = Injectable;

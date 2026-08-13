// file: src/studio/render/errors.ts
export class RendererError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "RendererError";
  }
}

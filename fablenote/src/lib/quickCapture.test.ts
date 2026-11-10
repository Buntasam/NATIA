import { describe, expect, it } from "vitest";
import { captureToNote } from "./quickCapture";

describe("capture rapide", () => {
  it("première ligne = titre, le reste en paragraphes échappés", () => {
    expect(captureToNote("Idée appli\nUne ligne\nla suite\n\n<b>gras</b>")).toEqual({
      title: "Idée appli",
      content: "<p>Une ligne<br>la suite</p><p>&lt;b&gt;gras&lt;/b&gt;</p>",
    });
  });
  it("une seule ligne : un titre et une note vide", () => {
    expect(captureToNote("  Appeler le garage  ")).toEqual({ title: "Appeler le garage", content: "<p></p>" });
  });
});

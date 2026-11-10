import { describe, expect, it } from "vitest";
import { appendTaskToHtml, setTaskInHtml } from "./tasks";

const html =
  '<ul data-type="taskList">' +
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Un</p>' +
  '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Sous</p></div></li></ul>' +
  "</div></li></ul>";

describe("setTaskInHtml", () => {
  it("coche la bonne case, dans l'ordre du document", () => {
    const out = setTaskInHtml(html, 1, true)!;
    const doc = new DOMParser().parseFromString(out, "text/html");
    const items = doc.querySelectorAll('li[data-type="taskItem"]');
    expect(items[0].getAttribute("data-checked")).toBe("false");
    expect(items[1].getAttribute("data-checked")).toBe("true");
    expect(items[1].querySelector("input")!.hasAttribute("checked")).toBe(true);
    expect(items[0].querySelector(":scope > label > input")!.hasAttribute("checked")).toBe(false);
  });
  it("décoche, et refuse une case qui n'existe pas", () => {
    expect(setTaskInHtml(setTaskInHtml(html, 0, true)!, 0, false)).toContain('data-checked="false"');
    expect(setTaskInHtml(html, 5, true)).toBeNull();
  });
});

describe("appendTaskToHtml", () => {
  const items = (out: string) =>
    [...new DOMParser().parseFromString(out, "text/html").querySelectorAll('li[data-type="taskItem"]')].map((li) => li.textContent);

  it("ajoute à la dernière liste de tâches, même suivie d'un paragraphe vide", () => {
    const out = appendTaskToHtml(html + "<p></p>", "Nouvelle");
    expect(items(out)).toEqual(["UnSous", "Sous", "Nouvelle"]);
    expect(out.match(/<ul data-type="taskList">/g)).toHaveLength(2);
    expect(out.endsWith("</ul>")).toBe(true);
  });
  it("crée une liste à la fin d'une note sans tâches, texte échappé", () => {
    const out = appendTaskToHtml("<h2>Mardi</h2><p>Notes</p>", "<b>pas du HTML</b>");
    expect(out).toContain('<ul data-type="taskList"><li data-checked="false" data-type="taskItem">');
    expect(out).toContain("&lt;b&gt;pas du HTML&lt;/b&gt;");
    expect(appendTaskToHtml("", "Seule")).toContain("<p>Seule</p>");
  });
});

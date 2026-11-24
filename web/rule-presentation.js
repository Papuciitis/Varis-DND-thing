"use strict";

// Reading layout only: source wording and the saved rules remain unchanged.
(() => {
  const keyTerms = /\b(?:bonus action|reaction|action|DC\s+\d+(?:\s*\+\s*(?:proficiency|your\s+[A-Za-z]+\s+modifier|[A-Za-z]+\s+modifier|\d+))*|\d+d\d+(?:\s*[+−-]\s*\d+)?|(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(?:saving throw|save|check))\b/gi;
  const actionTitle = text => /^As a bonus action\b/i.test(text) ? "Bonus action"
    : /^As a reaction\b/i.test(text) ? "Reaction"
    : /^As an action\b/i.test(text) ? "Action"
    : /^After an unblocked (?:[a-z-]+ )?strike\b/i.test(text) ? "On an unblocked strike"
    : /^(?:At|Each) dawn\b/i.test(text) ? "At dawn" : "";

  function element(document, tag, className, text) {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function emphasize(paragraph, text, document) {
    let start = 0;
    keyTerms.lastIndex = 0;
    for (const match of text.matchAll(keyTerms)) {
      if (match.index > start) paragraph.append(document.createTextNode(text.slice(start, match.index)));
      paragraph.append(element(document, "strong", "rule-key", match[0]));
      start = match.index + match[0].length;
    }
    if (start < text.length) paragraph.append(document.createTextNode(text.slice(start)));
  }

  function sentences(text) {
    // Keep the whitespace with its sentence so reading layout is lossless.
    // Decimal points and common inline abbreviations do not end a sentence.
    const boundaries = /[.!?][\])"']?\s+(?=[A-Z0-9])/g;
    const output = [];
    let start = 0;
    for (const match of text.matchAll(boundaries)) {
      const before = text.slice(0, match.index + 1);
      if (/(?:\be\.g|\bi\.e|\b(?:Mr|Mrs|Ms|Dr|vs))\.$/i.test(before)) continue;
      const end = match.index + match[0].length;
      output.push(text.slice(start, end));
      start = end;
    }
    if (start < text.length) output.push(text.slice(start));
    return output;
  }

  function sections(text, entry) {
    // This dense, multi-stage effect benefits from literal mechanic labels.
    // Guard its current wording as well as its stable identity: custom edits
    // that change its structure fall back to the ordinary presentation.
    const tether = "After an unblocked thrown strike,";
    const pull = "As a bonus action, pull it";
    if (entry?.details?.id === "mi-rare-066"
      && text.startsWith("This magical Varis Spear uses its printed Throw range.")
      && text.indexOf(tether) > 0 && text.indexOf(pull) > text.indexOf(tether)) {
      const first = text.indexOf(tether), second = text.indexOf(pull);
      return [{title: "Throw", text: text.slice(0, first)},
        {title: "Tether", text: text.slice(first, second)},
        {title: "Pull", text: text.slice(second)}];
    }
    if (text.trim().length < 520) return [{title: "", text}];
    const output = [];
    let current = {title: "", text: ""};
    for (const sentence of sentences(text)) {
      const title = actionTitle(sentence.trimStart());
      if (title && current.text.trim().length >= 80) {
        output.push(current);
        current = {title, text: ""};
      }
      current.text += sentence;
    }
    if (current.text) output.push(current);
    return output;
  }

  function paragraphs(text) {
    // Keep author-created line breaks. For a long unbroken block, divide
    // only between whole sentences, never inside a condition or dice value.
    const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).filter(Boolean);
    const output = [];
    for (const line of lines) {
      if (line.trim().length < 460) { output.push(line); continue; }
      let current = "";
      for (const sentence of sentences(line)) {
        if (current.trim().length >= 240 && (current + sentence).trim().length > 430) {
          output.push(current);
          current = "";
        }
        current += sentence;
      }
      if (current) output.push(current);
    }
    return output;
  }

  function appendDescription(container, value, entry) {
    const text = String(value ?? "");
    if (!text) return;
    const document = container.ownerDocument || globalThis.document;
    const description = element(document, "div", "rule-description");
    for (const section of sections(text, entry)) {
      const host = section.title ? element(document, "section", "rule-section") : description;
      if (section.title) host.append(element(document, "h3", "rule-section-heading", section.title));
      for (const content of paragraphs(section.text)) {
        const paragraph = element(document, "p", "rule-copy");
        emphasize(paragraph, content, document);
        host.append(paragraph);
      }
      if (host !== description) description.append(host);
    }
    container.append(description);
  }

  globalThis.RulePresentation = {appendDescription};
})();

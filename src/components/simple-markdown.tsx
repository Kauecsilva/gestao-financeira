// Renderiza o pouco de markdown que o assistente usa: **negrito**, listas com "-" e parágrafos.
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part,
  );
}

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ""), `${b}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""), `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

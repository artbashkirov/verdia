'use client';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Markdown parser for chat messages with proper nested list support
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const parseInline = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let inlineKey = 0;

    // Process bold (**text**)
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(remaining.slice(0, boldMatch.index));
        }
        parts.push(<strong key={`b-${inlineKey++}`}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      } else {
        parts.push(remaining);
        break;
      }
    }

    return parts;
  };

  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      
      // Check for numbered list start
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        // Collect the entire numbered list with nested items
        const listItems: Array<{ content: string; subItems: string[] }> = [];
        
        while (i < lines.length) {
          const currentLine = lines[i];
          const numMatch = currentLine.match(/^(\d+)\.\s+(.+)$/);
          
          if (numMatch) {
            // New numbered item
            listItems.push({ content: numMatch[2], subItems: [] });
            i++;
            
            // Check for sub-items (bullet points)
            while (i < lines.length) {
              const subLine = lines[i];
              const bulletMatch = subLine.match(/^[-*]\s+(.+)$/);
              
              if (bulletMatch) {
                listItems[listItems.length - 1].subItems.push(bulletMatch[1]);
                i++;
              } else if (subLine.trim() === '') {
                // Empty line - might continue or end
                i++;
              } else {
                break;
              }
            }
          } else if (currentLine.trim() === '') {
            // Check if next non-empty line is a numbered item
            let nextIndex = i + 1;
            while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
              nextIndex++;
            }
            if (nextIndex < lines.length && lines[nextIndex].match(/^\d+\.\s+/)) {
              i = nextIndex;
              continue;
            }
            break;
          } else {
            break;
          }
        }
        
        // Render the numbered list
        elements.push(
          <ol key={key++} className="list-decimal ml-5 my-3 space-y-3">
            {listItems.map((item, idx) => (
              <li key={idx}>
                <span>{parseInline(item.content)}</span>
                {item.subItems.length > 0 && (
                  <ul className="list-disc ml-5 mt-2 space-y-1">
                    {item.subItems.map((sub, subIdx) => (
                      <li key={subIdx}>{parseInline(sub)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Check for standalone bullet list
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        const bulletItems: string[] = [];
        
        while (i < lines.length) {
          const currentLine = lines[i];
          const bMatch = currentLine.match(/^[-*]\s+(.+)$/);
          
          if (bMatch) {
            bulletItems.push(bMatch[1]);
            i++;
          } else {
            break;
          }
        }
        
        elements.push(
          <ul key={key++} className="list-disc ml-5 my-2 space-y-1">
            {bulletItems.map((item, idx) => (
              <li key={idx}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={key++} className="mb-3 last:mb-0">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
}

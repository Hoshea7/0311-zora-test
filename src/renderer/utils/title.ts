/**
 * 从用户消息中提取一个简洁、自然的会话标题
 * 支持中文、英文和混合场景。
 */
export function generateSmartTitle(text: string, maxLength = 50): string {
  const message = text.trim();

  if (!message) {
    return "新会话";
  }

  if (message.length <= maxLength) {
    return message;
  }

  const sentenceEnd = message
    .slice(0, maxLength + 10)
    .search(/[。.!！?？\n]/);

  if (sentenceEnd > 0 && sentenceEnd <= maxLength) {
    return message.slice(0, sentenceEnd).trim();
  }

  const chunk = message.slice(0, maxLength);
  const breakPoints = [
    chunk.lastIndexOf(" "),
    chunk.lastIndexOf("，"),
    chunk.lastIndexOf(","),
    chunk.lastIndexOf("、"),
    chunk.lastIndexOf("；"),
    chunk.lastIndexOf(";"),
    chunk.lastIndexOf("："),
    chunk.lastIndexOf(":"),
  ];
  const bestBreak = Math.max(...breakPoints);

  if (bestBreak > maxLength * 0.3) {
    return `${chunk.slice(0, bestBreak).trim()}…`;
  }

  return `${chunk.trim()}…`;
}

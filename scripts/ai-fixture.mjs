import { createServer } from 'node:http';

createServer(async (request, response) => {
  const finish = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  try {
    if (request.method !== 'POST') return finish(404, {});
    const parts = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1_600_000) return finish(413, {});
      parts.push(chunk);
    }
    const body = Buffer.concat(parts).toString();
    if (request.url === '/v1/audio/transcriptions') {
      return finish(body.includes('name="file"') ? 200 : 400, { text: 'Fixture microphone transcript.' });
    }
    const data = JSON.parse(body);
    if (request.url === '/v1/embeddings') return finish(200, { data: [{ embedding: [1, 0] }] });
    if (request.url !== '/v1/chat/completions') return finish(404, {});
    const content = data.messages.at(-1).content;
    if (content.includes('Forbidden separate-room marker')) return finish(422, {});
    const answer = content.includes('Fixture microphone transcript')
      ? 'Fixture draft from transcript.'
      : JSON.stringify({ answer: 'The pump is blue.', sources: [1] });
    return finish(200, { choices: [{ message: { content: answer } }] });
  } catch {
    return finish(400, {});
  }
}).listen(8092, '127.0.0.1');

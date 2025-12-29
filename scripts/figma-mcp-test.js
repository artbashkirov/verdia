#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки работы Figma MCP сервера
 * Использование: node scripts/figma-mcp-test.js
 */

const http = require('http');

const MCP_URL = 'http://127.0.0.1:3845/mcp';

async function callMCP(method, params = {}) {
  return new Promise((resolve, reject) => {
    // Сначала инициализируем сессию
    const initData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'figma-mcp-test',
          version: '1.0.0'
        }
      }
    });

    const options = {
      hostname: '127.0.0.1',
      port: 3845,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const initResponse = JSON.parse(body);
          console.log('Init response:', initResponse);
          
          // Теперь делаем основной запрос
          const data = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: method,
            params: params
          });

    const options = {
      hostname: '127.0.0.1',
      port: 3845,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });

    req.write(data);
    req.end();
  });
}

async function testMCP() {
  console.log('🔍 Проверка подключения к Figma MCP серверу...\n');
  
  try {
    // Попробуем получить информацию о текущем выделении
    const result = await callMCP('mcp/figma/get_selection');
    console.log('✅ MCP сервер отвечает!');
    console.log('📊 Результат:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.log('\n💡 Убедитесь, что:');
    console.log('   1. Figma Desktop приложение открыто');
    console.log('   2. Макет открыт в Figma');
    console.log('   3. Dev Mode включен (Shift + D)');
    console.log('   4. MCP сервер включен в правой панели');
  }
}

testMCP();


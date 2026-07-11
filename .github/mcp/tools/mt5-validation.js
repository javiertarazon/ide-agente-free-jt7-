#!/usr/bin/env node

/**
 * Script de validación y prueba de herramientas MT5
 * 
 * Ejecutar con:
 *   node mt5-validation.js
 *   node mt5-validation.js --test-all
 *   node mt5-validation.js --test account
 */

const fs = require('fs');
const path = require('path');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

// ============================================================================
// UTILIDADES
// ============================================================================

function log(text, color = 'reset') {
  console.log(colors[color] + text + colors.reset);
}

function success(text) {
  log(`✅ ${text}`, 'green');
}

function error(text) {
  log(`❌ ${text}`, 'red');
}

function warning(text) {
  log(`⚠️  ${text}`, 'yellow');
}

function info(text) {
  log(`ℹ️  ${text}`, 'cyan');
}

function section(title) {
  console.log('\n' + colors.blue + '━'.repeat(60) + colors.reset);
  log(title, 'blue');
  console.log(colors.blue + '━'.repeat(60) + colors.reset);
}

// Simulación de herramientas MT5 (reemplazar con llamadas reales)
const mt5Tools = {
  loginMT5: async (creds) => {
    // Simular
    return {
      status: 'success',
      login: creds.login,
      server: creds.server,
      timestamp: new Date().toISOString()
    };
  },
  
  getAccountInfo: async () => {
    return {
      balance: 10000.00,
      equity: 10150.50,
      profit: 150.50,
      margin: 500.00,
      margin_free: 9500.00,
      margin_level: 2030.00,
      leverage: 1,
      account_type: 'Demo'
    };
  },
  
  getSymbols: async () => {
    return [
      { name: 'EURUSD', bid: 1.0950, ask: 1.0952, spread: 2 },
      { name: 'GBPUSD', bid: 1.2750, ask: 1.2752, spread: 2 },
      { name: 'USDJPY', bid: 149.50, ask: 149.52, spread: 2 },
      { name: 'AUDUSD', bid: 0.6650, ask: 0.6652, spread: 2 },
      { name: 'NZDUSD', bid: 0.5950, ask: 0.5952, spread: 2 }
    ];
  },
  
  getOHLC: async (params) => {
    // Generar datos simulados
    const candles = [];
    let basePrice = params.symbol === 'EURUSD' ? 1.0950 : 100.00;
    
    for (let i = 0; i < params.count; i++) {
      const open = basePrice + (Math.random() - 0.5) * 0.0010;
      const close = open + (Math.random() - 0.5) * 0.0010;
      candles.push({
        time: Math.floor(Date.now() / 1000) - (params.count - i) * 3600,
        open: open,
        high: Math.max(open, close) + Math.random() * 0.0005,
        low: Math.min(open, close) - Math.random() * 0.0005,
        close: close,
        volume: Math.floor(Math.random() * 10000)
      });
    }
    return candles;
  },
  
  getSymbolInfo: async (symbol) => {
    const prices = {
      'EURUSD': { bid: 1.0950, ask: 1.0952 },
      'GBPUSD': { bid: 1.2750, ask: 1.2752 },
      'USDJPY': { bid: 149.50, ask: 149.52 }
    };
    return prices[symbol] || { bid: 100.00, ask: 100.02 };
  },
  
  getOpenOrders: async () => {
    return [
      {
        ticket: 123456,
        symbol: 'EURUSD',
        type: 'BUY',
        volume: 1.0,
        open_price: 1.0910,
        current_price: 1.0950,
        sl: 1.0880,
        tp: 1.1000,
        profit: 40.00
      }
    ];
  },
  
  openOrder: async (params) => {
    return {
      ticket: Math.floor(Math.random() * 1000000),
      status: 'success',
      symbol: params.symbol,
      volume: params.volume,
      price: params.price
    };
  },
  
  closeOrder: async (params) => {
    return {
      ticket: params.ticket,
      close_price: 1.0960,
      profit: 50.00,
      status: 'success'
    };
  },
  
  modifyOrder: async (params) => {
    return {
      ticket: params.ticket,
      status: 'success',
      sl: params.sl
    };
  },
  
  getOrderHistory: async (params) => {
    const trades = [];
    for (let i = 0; i < params.limit; i++) {
      trades.push({
        ticket: 1000000 + i,
        symbol: ['EURUSD', 'GBPUSD', 'USDJPY'][i % 3],
        type: ['BUY', 'SELL'][i % 2],
        volume: 1.0,
        open_price: 1.0900 + (Math.random() - 0.5) * 0.1,
        close_price: 1.0920 + (Math.random() - 0.5) * 0.1,
        profit: (Math.random() - 0.5) * 100
      });
    }
    return trades;
  }
};

// ============================================================================
// TESTS
// ============================================================================

const tests = {
  async conexion() {
    section('TEST 1: Conexión y Autenticación');
    
    try {
      info('Intentando conectar a MT5...');
      
      const result = await mt5Tools.loginMT5({
        login: 174873,
        password: 'demo',
        server: 'ThinkMarkets-Demo'
      });
      
      if (result.status === 'success') {
        success(`Conectado como ${result.login} en ${result.server}`);
        return true;
      } else {
        error('Fallo en conexión');
        return false;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  },
  
  async cuenta() {
    section('TEST 2: Información de Cuenta');
    
    try {
      const account = await mt5Tools.getAccountInfo();
      
      info(`Balance: ${account.balance.toFixed(2)} USD`);
      info(`Equity: ${account.equity.toFixed(2)} USD`);
      info(`Margen libre: ${account.margin_free.toFixed(2)} USD`);
      info(`Nivel de margen: ${account.margin_level.toFixed(2)}%`);
      
      if (account.margin_level > 100) {
        success('Margen disponible suficiente');
        return true;
      } else {
        warning('Margen bajo');
        return true;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  },
  
  async simbolos() {
    section('TEST 3: Obtención de Símbolos');
    
    try {
      const symbols = await mt5Tools.getSymbols();
      
      info(`Total de símbolos encontrados: ${symbols.length}`);
      
      symbols.slice(0, 3).forEach(s => {
        log(`  ${s.name}: ${s.bid} / ${s.ask} (spread: ${s.spread})`);
      });
      
      if (symbols.length > 0) {
        success('Símbolos obtenidos correctamente');
        return true;
      } else {
        error('No se encontraron símbolos');
        return false;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  },
  
  async ohlc() {
    section('TEST 4: Datos OHLC');
    
    try {
      info('Obteniendo datos H1 para EURUSD...');
      
      const candles = await mt5Tools.getOHLC({
        symbol: 'EURUSD',
        timeframe: 'H1',
        count: 20
      });
      
      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        info(`Velas obtenidas: ${candles.length}`);
        log(`  Última vela: O=${latest.open.toFixed(5)} H=${latest.high.toFixed(5)} L=${latest.low.toFixed(5)} C=${latest.close.toFixed(5)}`, 'dim');
        
        // Calcular ATR
        const atrs = candles.slice(0, -1).map((curr, i) => {
          if (i === 0) return null;
          const prev = candles[i - 1];
          const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
          );
          return tr;
        }).filter(v => v !== null);
        
        const atr = atrs.reduce((a, b) => a + b) / atrs.length;
        info(`ATR calculado: ${atr.toFixed(5)}`);
        
        success('OHLC procesado correctamente');
        return true;
      } else {
        error('No se obtuvieron velas');
        return false;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  },
  
  async ordenes() {
    section('TEST 5: Gestión de Órdenes');
    
    try {
      info('Obteniendo órdenes abiertas...');
      
      const orders = await mt5Tools.getOpenOrders();
      
      if (orders.length > 0) {
        info(`Órdenes abiertas: ${orders.length}`);
        orders.forEach(o => {
          log(`  ${o.symbol} ${o.type} - Entrada: ${o.open_price.toFixed(5)} - Profit: ${o.profit.toFixed(2)} USD`, 'dim');
        });
        success('Órdenes obtenidas correctamente');
        return true;
      } else {
        warning('No hay órdenes abiertas');
        return true;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  },
  
  async historial() {
    section('TEST 6: Historial de Operaciones');
    
    try {
      info('Obteniendo últimas 10 operaciones...');
      
      const history = await mt5Tools.getOrderHistory({ limit: 10 });
      
      if (history.length > 0) {
        let wins = history.filter(t => t.profit > 0).length;
        let losses = history.filter(t => t.profit < 0).length;
        let totalEarnin = history.reduce((sum, t) => sum + t.profit, 0);
        
        info(`Total operaciones: ${history.length}`);
        info(`Ganadoras: ${wins} / Perdedoras: ${losses}`);
        info(`Earnings: ${totalEarnin.toFixed(2)} USD`);
        
        success('Historial obtenido correctamente');
        return true;
      } else {
        warning('No hay historial');
        return true;
      }
    } catch (err) {
      error(`Error: ${err.message}`);
      return false;
    }
  }
};

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================

async function runTests() {
  const args = process.argv.slice(2);
  const testAll = args.includes('--test-all');
  const testName = args.find(a => !a.startsWith('--'));
  
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     VALIDACIÓN DE HERRAMIENTAS MT5 PARA VS CODE         ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  const results = {};
  
  if (testAll || !testName) {
    // Ejecutar todos
    for (const [name, test] of Object.entries(tests)) {
      try {
        results[name] = await test();
      } catch (err) {
        error(`Test ${name} falló: ${err.message}`);
        results[name] = false;
      }
    }
  } else {
    // Ejecutar específico
    if (tests[testName]) {
      try {
        results[testName] = await tests[testName]();
      } catch (err) {
        error(`Test ${testName} falló: ${err.message}`);
        results[testName] = false;
      }
    } else {
      error(`Test '${testName}' no encontrado`);
      log(`Tests disponibles: ${Object.keys(tests).join(', ')}`);
    }
  }
  
  // Resumen
  section('RESUMEN');
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.values(results).length;
  
  Object.entries(results).forEach(([name, result]) => {
    const status = result ? '✅' : '❌';
    log(`${status} ${name}`);
  });
  
  const percentage = Math.round((passed / total) * 100);
  log(`\nTotal: ${passed}/${total} (${percentage}%)`);
  
  if (percentage === 100) {
    success('\n¡Todos los tests pasaron!\n');
    process.exit(0);
  } else {
    warning(`\n${total - passed} tests fallaron\n`);
    process.exit(1);
  }
}

runTests().catch(err => {
  error(`Error fatal: ${err.message}`);
  process.exit(1);
});

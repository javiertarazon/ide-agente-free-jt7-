/**
 * Ejemplos de uso de herramientas MT5 desde VS Code
 * 
 * Todos los ejemplos usan las herramientas disponibles a través del servidor MCP
 * que se conecta con la instancia MT5 local.
 */

// ============================================================================
// EJEMPLO 1: Conexión básica y obtención de estado
// ============================================================================

async function ejemploConexionBasica() {
  console.log("📡 Conectando a MT5 y obteniendo estado...\n");

  try {
    // Iniciar sesión
    const login = await mt5Tools.loginMT5({
      login: 174873,
      password: "Jatr28037$",
      server: "ThinkMarkets-Demo"
    });
    
    console.log("✅ Sesión iniciada:", login);
    
    // Obtener estado de la cuenta
    const accountInfo = await mt5Tools.getAccountInfo();
    console.log("💼 Información de cuenta:");
    console.log("  Balance:", accountInfo.balance, "USD");
    console.log("  Equity:", accountInfo.equity, "USD");
    console.log("  Margen libre:", accountInfo.margin_free, "USD");
    console.log("  Nivel de margen:", accountInfo.margin_level, "%");
    
    // Obtener símbolos disponibles
    const symbols = await mt5Tools.getSymbols();
    console.log("\n📊 Primeros 5 símbolos disponibles:");
    symbols.slice(0, 5).forEach(s => {
      console.log(`  - ${s.name}: Bid=${s.bid}, Ask=${s.ask}`);
    });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EJEMPLO 2: Análisis de datos históricos (OHLC)
// ============================================================================

async function ejemploOHLC() {
  console.log("📈 Obtener datos OHLC para análisis...\n");

  try {
    // Obtener datos históricos H1
    const candles = await mt5Tools.getOHLC({
      symbol: "EURUSD",
      timeframe: "H1",
      count: 50  // Últimas 50 velas
    });
    
    console.log(`Datos EURUSD H1 (últimas ${candles.length} velas):`);
    console.log("  Timestamp      | Open    | High    | Low     | Close   | Volume");
    console.log("  " + "─".repeat(70));
    
    candles.slice(-5).forEach(candle => {
      const time = new Date(candle.time * 1000).toISOString();
      console.log(
        `  ${time.slice(0, 16)} | ${candle.open.toFixed(5)} | ${candle.high.toFixed(5)} | ${candle.low.toFixed(5)} | ${candle.close.toFixed(5)} | ${candle.volume}`
      );
    });
    
    // Calcular ATR (Average True Range) desde los datos
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
    console.log(`\n📊 ATR calculado: ${atr.toFixed(5)}`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EJEMPLO 3: Abrir orden BUY con gestión de riesgo
// ============================================================================

async function ejemploAbrirOrdenBuy() {
  console.log("🔵 Abrir orden BUY con SL y TP...\n");

  try {
    // Parámetros
    const symbol = "EURUSD";
    const riskPerTrade = 0.005;  // 0.5%
    const atrMultiplierSL = 1.8;
    const atrMultiplierTP = 2.2;
    
    // Obtener precio actual y ATR
    const quote = await mt5Tools.getSymbolInfo(symbol);
    const candles = await mt5Tools.getOHLC({
      symbol: symbol,
      timeframe: "H1",
      count: 20
    });
    
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
    
    // Calcular niveles
    const entryPrice = quote.ask;
    const slPrice = entryPrice - (atr * atrMultiplierSL);
    const tpPrice = entryPrice + (atr * atrMultiplierTP);
    
    // Obtener balance para calcular volumen
    const account = await mt5Tools.getAccountInfo();
    const riskMoney = account.balance * riskPerTrade;
    const pipValue = 0.0001;  // Para EURUSD
    const riskPips = Math.abs(entryPrice - slPrice) / pipValue;
    const volume = (riskMoney / (riskPips * 10)) / 100;  // Aproximado
    
    console.log("📋 Orden a abrir:");
    console.log(`  Símbolo: ${symbol}`);
    console.log(`  Tipo: BUY`);
    console.log(`  Entry: ${entryPrice.toFixed(5)}`);
    console.log(`  SL: ${slPrice.toFixed(5)} (-${(atr * atrMultiplierSL).toFixed(5)})`);
    console.log(`  TP: ${tpPrice.toFixed(5)} (+${(atr * atrMultiplierTP).toFixed(5)})`);
    console.log(`  Volumen (aproximado): ${volume.toFixed(2)} lotes`);
    console.log(`  Riesgo: ${riskMoney.toFixed(2)} USD`);
    
    // Abrir orden
    const orden = await mt5Tools.openOrder({
      symbol: symbol,
      order_type: "BUY",
      volume: volume,
      price: entryPrice,
      sl: slPrice,
      tp: tpPrice,
      comment: "ejemploAbrirOrdenBuy - Riesgo 0.5%"
    });
    
    console.log("\n✅ Orden abierta:");
    console.log(`  Ticket: ${orden.ticket}`);
    console.log(`  Estado: ${orden.status}`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EJEMPLO 4: Monitorear órdenes abiertas y aplicar trailing stop
// ============================================================================

async function ejemploTrailingStop() {
  console.log("🛡️  Monitorear órdenes y aplicar trailing stop...\n");

  try {
    // Obtener órdenes abiertas
    const orders = await mt5Tools.getOpenOrders();
    
    if (orders.length === 0) {
      console.log("No hay órdenes abiertas");
      return;
    }
    
    console.log(`Encontradas ${orders.length} órdenes abiertas:\n`);
    
    for (const order of orders) {
      console.log(`📌 Ticket ${order.ticket}:`);
      console.log(`  Símbolo: ${order.symbol}`);
      console.log(`  Tipo: ${order.type}`);
      console.log(`  Volumen: ${order.volume}`);
      console.log(`  Entrada: ${order.open_price}`);
      console.log(`  Precio actual: ${order.current_price}`);
      console.log(`  Profit/Loss: ${order.profit.toFixed(2)} USD`);
      
      // Aplicar trailing stop
      const quote = await mt5Tools.getSymbolInfo(order.symbol);
      const candles = await mt5Tools.getOHLC({
        symbol: order.symbol,
        timeframe: "H1",
        count: 14
      });
      
      // ATR
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
      
      // Nuevo SL según trailing stop
      let newSL = order.sl;
      
      if (order.type === "BUY") {
        const profitR = (quote.bid - order.open_price) / atr;
        if (profitR > 0.5) {  // Si hay 0.5R de ganancia
          newSL = Math.max(order.sl, quote.bid - (atr * 0.85));
        }
      } else if (order.type === "SELL") {
        const profitR = (order.open_price - quote.ask) / atr;
        if (profitR > 0.5) {
          newSL = Math.min(order.sl, quote.ask + (atr * 0.85));
        }
      }
      
      if (newSL !== order.sl) {
        console.log(`  ⚙️  Actualizando SL: ${order.sl} → ${newSL}`);
        await mt5Tools.modifyOrder({
          ticket: order.ticket,
          sl: newSL
        });
        console.log(`  ✅ SL actualizado`);
      }
      console.log();
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EJEMPLO 5: Cierre de orden con análisis de resultado
// ============================================================================

async function ejemploCerrarOrden(ticket) {
  console.log(`🔴 Cerrar orden ${ticket}...\n`);

  try {
    // Obtener detalles de la orden
    const order = await mt5Tools.getOrderDetails(ticket);
    
    if (!order) {
      console.log("❌ Orden no encontrada");
      return;
    }
    
    console.log("📋 Detalles de orden abierta:");
    console.log(`  Tipo: ${order.type}`);
    console.log(`  Símbolo: ${order.symbol}`);
    console.log(`  Volumen: ${order.volume}`);
    console.log(`  Entrada: ${order.open_price.toFixed(5)}`);
    console.log(`  Precio actual: ${order.current_price.toFixed(5)}`);
    console.log(`  SL: ${order.sl.toFixed(5)}`);
    console.log(`  TP: ${order.tp.toFixed(5)}`);
    console.log(`  Profit: ${order.profit.toFixed(2)} USD`);
    
    // Cerrar orden
    const resultado = await mt5Tools.closeOrder({
      ticket: ticket,
      volume: order.volume
    });
    
    console.log("\n✅ Orden cerrada:");
    console.log(`  Precio de cierre: ${resultado.close_price.toFixed(5)}`);
    console.log(`  Profit final: ${resultado.profit.toFixed(2)} USD`);
    
    // Análisis
    const rr = (result.close_price - order.open_price) / (order.open_price - order.sl);
    console.log(`  Risk/Reward logrado: ${rr.toFixed(2)}`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EJEMPLO 6: Obtener histórico de operaciones
// ============================================================================

async function ejemploHistoricoOperaciones() {
  console.log("📚 Obtener histórico de operaciones...\n");

  try {
    const history = await mt5Tools.getOrderHistory({
      limit: 20  // Últimas 20 operaciones
    });
    
    console.log(`Total de operaciones: ${history.length}\n`);
    
    let totalProfit = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    
    console.log("Operación | Símbolo | Tipo   | Volumen | Entrada   | Cierre    | Profit");
    console.log("─".repeat(80));
    
    history.forEach((trade, idx) => {
      const profit = trade.profit || 0;
      totalProfit += profit;
      if (profit > 0) winningTrades++;
      else if (profit < 0) losingTrades++;
      
      console.log(
        `${trade.ticket.toString().padEnd(9)} | ` +
        `${trade.symbol.padEnd(7)} | ` +
        `${trade.type.padEnd(6)} | ` +
        `${trade.volume.toString().padEnd(7)} | ` +
        `${trade.open_price.toFixed(5)} | ` +
        `${trade.close_price.toFixed(5)} | ` +
        `${profit.toFixed(2).padStart(10)}`
      );
    });
    
    console.log("\n📊 Estadísticas:");
    console.log(`  Ganancia total: ${totalProfit.toFixed(2)} USD`);
    console.log(`  Operaciones ganadoras: ${winningTrades}`);
    console.log(`  Operaciones perdedoras: ${losingTrades}`);
    console.log(`  Tasa de acierto: ${((winningTrades / history.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ============================================================================
// EXPORTAR EJEMPLOS
// ============================================================================

module.exports = {
  ejemploConexionBasica,
  ejemploOHLC,
  ejemploAbrirOrdenBuy,
  ejemploTrailingStop,
  ejemploCerrarOrden,
  ejemploHistoricoOperaciones
};

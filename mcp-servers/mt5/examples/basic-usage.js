/**
 * EJEMPLO 1: Uso básico del servidor MCP MT5
 * Conectar a MT5 y obtener información de cuenta
 */

const { Client } = require("/mcp/client");

async function basicExample() {
  const client = new Client({
    command: "python",
    args: ["/path/to/mt5_server.py"],
  });

  try {
    // 1. CONECTAR A CUENTA
    console.log("📱 Conectando a MT5...");
    const login = await client.call("mt5_login", {
      login: 174873,
      password: "Jatr28037$",
      server: "ThinkMarkets-Demo",
    });
    console.log("✅ Login exitoso:", login);

    // 2. OBTENER INFO CUENTA
    console.log("\n💰 Información de cuenta:");
    const accountInfo = await client.call("mt5_account_info", {});
    console.log({
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      free_margin: accountInfo.free_margin,
      margin_level: accountInfo.margin_level,
    });

    // 3. OBTENER POSICIONES
    console.log("\n📊 Posiciones abiertas:");
    const positions = await client.call("mt5_get_positions", {});
    positions.forEach((pos) => {
      console.log(
        `  ${pos.symbol}: ${pos.type} ${pos.volume}lot @ ${pos.price_open}`
      );
    });

    // 4. OBTENER ORDENES PENDIENTES
    console.log("\n⏳ Órdenes pendientes:");
    const orders = await client.call("mt5_get_orders", {});
    orders.forEach((ord) => {
      console.log(
        `  ${ord.symbol}: ${ord.type} ${ord.volume}lot @ ${ord.price_open}`
      );
    });

    // 5. OBTENER HISTORIAL
    console.log("\n📜 Últimas operaciones cerradas:");
    const deals = await client.call("mt5_get_deals", {
      from_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Últimos 7 días
      limit: 5,
    });
    deals.forEach((deal) => {
      console.log(`  ${deal.symbol}: ${deal.profit} USD`);
    });

    // 6. DESCONECTAR
    await client.call("mt5_logout", {});
    console.log("\n✅ Desconectado");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

basicExample();

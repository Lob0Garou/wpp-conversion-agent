// ─── HUMAN LOOP CONFIG ───
// Configurações para o sistema de transferência para atendente humano

export const humanLoopConfig = {
  // Grupo do WhatsApp para alertas de vendas (produto sem estoque)
  groups: {
    sales: process.env.WPP_GROUP_SALES_ID ?? '',
    sac: process.env.WPP_GROUP_SAC_ID ?? '',
  },

  // Timezone para cálculo do fim do dia
  timezone: process.env.SERVER_TIMEZONE ?? 'America/Recife',

  // Configurações de handoff
  handoff: {
    // Hora final do dia para lock (23:59:59)
    endOfDayHour: 23,
    endOfDayMinute: 59,
    endOfDaySecond: 59,
  },

  // Sinais de alta intenção de compra (usados para decisão de handoff)
  highIntentSignals: [
    'quero comprar',
    'vou buscar',
    'pode reservar',
    'separa',
    'hoje',
    'agora',
    'já vou',
    'passo amanhã',
    'pode separar',
    'quero levar',
    'vou passar',
  ],
};

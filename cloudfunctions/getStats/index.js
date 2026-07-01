const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '未登录' };

  try {
    // 从 gameRecords 集合查询用户参与过的所有对局记录
    const records = await db.collection('gameRecords')
      .where({ 'players.openId': OPENID })
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    if (!records.data || records.data.length === 0) {
      return {
        success: true,
        profile: { totalGames: 0, totalWins: 0, totalProfit: 0, bestHand: '', level: 1, winRate: 0 },
        dailyStats: []
      };
    }

    let totalGames = 0;
    let totalWins = 0;
    let totalProfit = 0;
    let bestHandName = '';
    let bestHandScore = 0;
    let zjhGames = 0;
    let pokerGames = 0;
    const dailyMap = {};

    for (const record of records.data) {
      const player = record.players.find(p => p.openId === OPENID);
      if (!player) continue;

      totalGames++;
      if (record.gameType === 'zjh') zjhGames++;
      else pokerGames++;

      const defaultChips = record.defaultChips || 10000;
      // 优先使用记录中保存的 per-hand profit，旧记录用 chips - defaultChips 兜底
      const profit = (player.profit !== undefined && player.profit !== null)
        ? player.profit
        : ((player.chips || 0) - defaultChips);
      totalProfit += profit;

      if (profit > 0) totalWins++;

      const zjhHandResult = player.zjh_handResult || player.handResult;
      if (zjhHandResult && zjhHandResult.score > bestHandScore) {
        bestHandScore = zjhHandResult.score;
        bestHandName = zjhHandResult.name;
      }

      const date = new Date(record.createdAt);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          gamesPlayed: 0,
          gamesWon: 0,
          handsPlayed: 0,
          totalBet: 0,
          totalProfit: 0
        };
      }

      dailyMap[dateKey].gamesPlayed++;
      if (profit > 0) dailyMap[dateKey].gamesWon++;
      dailyMap[dateKey].totalProfit += profit;
      dailyMap[dateKey].totalBet += (player.totalBet || 0);
      dailyMap[dateKey].handsPlayed++;
    }

    const winRate = totalGames > 0 ? Math.round(totalWins / totalGames * 100) : 0;
    const level = Math.floor(totalGames / 10) + 1;

    const dailyStats = Object.values(dailyMap)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    return {
      success: true,
      profile: {
        totalGames,
        totalWins,
        totalProfit,
        bestHand: bestHandName,
        level,
        winRate,
        zjhGames,
        pokerGames
      },
      dailyStats
    };
  } catch (err) {
    console.error('getStats error:', err);
    return { success: false, error: err.message };
  }
};
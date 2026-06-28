const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId } = event;

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    const defaultChips = room.defaultChips || 10000;
    const bigBlind = room.bigBlind || 20;

    const resetPlayers = room.players.map(p => ({
      ...p,
      holeCards: [],
      isActive: p.chips > 0,
      isAllIn: false,
      hasActed: false,
      totalBetThisRound: 0,
      totalBet: 0,
      handResult: null,
      confirmedNext: false,
      isReady: false,
      rebuyCount: 0
    }));

    await db.collection('rooms').doc(roomId).update({
      data: {
        status: 'waiting',
        startCountdownAt: 0,
        phase: 'PRE_FLOP',
        phaseIndex: 0,
        communityCards: [],
        pot: 0,
        currentBet: 0,
        minRaise: bigBlind,
        currentPlayerIndex: 0,
        dealerIndex: 0,
        deck: [],
        players: resetPlayers,
        gameHistory: [],
        updatedAt: Date.now(),
        isGameEnded: false,
        zjh_roundCount: 0,
        zjh_lastRaiser: '',
        zjh_lastCompare: null,
        zjh_compareConfirmMap: {},
        zjh_compareResult: null
      }
    });

    return { success: true };
  } catch (e) {
    console.error('resetGame error:', e);
    return { success: false, error: e.message };
  }
};
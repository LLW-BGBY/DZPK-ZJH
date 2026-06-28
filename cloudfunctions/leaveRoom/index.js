const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { roomId } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };
  if (!roomId) return { success: false, error: '缺少房间ID' };

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    const playerIndex = room.players.findIndex(p => p.openId === OPENID);
    if (playerIndex === -1) return { success: false, error: '你不在此房间' };

    const updatedPlayers = room.players.filter(p => p.openId !== OPENID);
    const now = Date.now();

    if (updatedPlayers.length === 0) {
      // 删除空房间
      await db.collection('rooms').doc(roomId).remove();
      return { success: true, message: '房间已删除' };
    }

    // If leaving player was the only active one, end the game
    const activePlayers = updatedPlayers.filter(p => p.isActive);
    let status = room.status;
    let history = room.gameHistory || [];
    let pot = room.pot;

    if (room.status === 'playing' && activePlayers.length <= 1 && status !== 'ended') {
      status = 'ended';
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        winner.chips += pot;
        history.push({ message: `${winner.name} 获胜（其他玩家离开）`, type: 'win', time: now });
      }
    }

    // If creator left, transfer ownership
    let creatorOpenId = room.creatorOpenId;
    if (creatorOpenId === OPENID && updatedPlayers.length > 0) {
      creatorOpenId = updatedPlayers[0].openId;
    }

    await db.collection('rooms').doc(roomId).update({
      data: {
        players: updatedPlayers,
        creatorOpenId,
        status,
        pot: status === 'ended' ? 0 : pot,
        gameHistory: history,
        updatedAt: now
      }
    });

    return { success: true, message: '已离开房间' };
  } catch (err) {
    console.error('leaveRoom error:', err);
    return { success: false, error: err.message };
  }
};

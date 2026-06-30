const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { roomId, isReady } = event;
  const { OPENID } = cloud.getWXContext();

  if (!roomId || !OPENID) {
    return { success: false, error: '参数无效' };
  }

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) {
      return { success: false, error: '房间不存在' };
    }

    const room = roomRes.data;
    if (room.status !== 'waiting') {
      return { success: false, error: '当前不可准备' };
    }

    const playerIndex = room.players.findIndex(p => p.openId === OPENID);
    if (playerIndex < 0) {
      return { success: false, error: '不在房间中' };
    }

    const updatedAt = Date.now();
    // 仅更新单个玩家的 isReady，避免并发覆盖整个 players 数组
    await db.collection('rooms').doc(roomId).update({
      data: {
        [`players.${playerIndex}.isReady`]: !!isReady,
        updatedAt
      }
    });

    // 检查是否全员准备 -> 写入倒计时时间戳，确保所有玩家都能同步看到倒计时
    if (isReady) {
      const activePlayers = room.players.filter(p => p.chips > 0);
      const allReady = activePlayers.length >= 2 && activePlayers.every(p => {
        if (p.openId === OPENID) return true;
        return p.isReady;
      });
      if (allReady && !room.startCountdownAt) {
        await db.collection('rooms').doc(roomId).update({
          data: { startCountdownAt: Date.now() }
        });
      }
    }

    return { success: true };
  } catch (e) {
    console.error('setReady error:', e);
    return { success: false, error: e.message };
  }
};
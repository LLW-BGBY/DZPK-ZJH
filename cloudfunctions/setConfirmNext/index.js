const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId, isConfirmNext } = event;
  const { OPENID } = cloud.getWXContext();

  if (!roomId || !OPENID) {
    return { success: false, error: '参数无效' };
  }

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    const playerIndex = room.players.findIndex(p => p.openId === OPENID);
    if (playerIndex < 0) {
      return { success: false, error: '不在房间中' };
    }

    const updatedAt = Date.now();
    await db.collection('rooms').doc(roomId).update({
      data: {
        [`players.${playerIndex}.confirmedNext`]: !!isConfirmNext,
        updatedAt
      }
    });

    return { success: true };
  } catch (e) {
    console.error('setConfirmNext error:', e);
    return { success: false, error: e.message };
  }
};
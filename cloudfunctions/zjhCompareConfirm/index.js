const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId, clear, compareTimestamp } = event;
  const { OPENID } = cloud.getWXContext();

  if (!roomId || !OPENID) {
    return { success: false, error: '参数无效' };
  }

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    const updatedAt = Date.now();

    if (clear) {
      await db.collection('rooms').doc(roomId).update({
        data: { zjh_compareConfirmMap: {}, updatedAt }
      });
      return { success: true, confirmMap: {} };
    }

    // 验证确认请求是否属于当前比牌，防止旧确认污染新比牌
    if (compareTimestamp) {
      const currentCompare = room.zjh_lastCompare;
      if (!currentCompare || currentCompare.timestamp !== compareTimestamp) {
        return { success: false, error: '比牌已过期，请重新确认' };
      }
    }

    const zjh_confirmMap = room.zjh_compareConfirmMap || {};
    zjh_confirmMap[OPENID] = true;

    await db.collection('rooms').doc(roomId).update({
      data: {
        zjh_compareConfirmMap: zjh_confirmMap,
        updatedAt
      }
    });

    return { success: true, confirmMap: zjh_confirmMap };
  } catch (e) {
    console.error('zjhCompareConfirm error:', e);
    return { success: false, error: e.message };
  }
};
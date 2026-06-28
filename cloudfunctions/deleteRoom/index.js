const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { roomId } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };
  if (!roomId) return { success: false, error: '缺少房间ID' };

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    // 只有房主可以删除
    if (room.creatorOpenId !== OPENID) return { success: false, error: '只有房主可以删除' };

    await db.collection('rooms').doc(roomId).remove();
    return { success: true };
  } catch (err) {
    console.error('deleteRoom error:', err);
    return { success: false, error: err.message };
  }
};

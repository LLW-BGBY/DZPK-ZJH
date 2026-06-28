const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { roomId, message, name, openId } = event;
  const wxContext = cloud.getWXContext();
  const OPENID = openId || wxContext.OPENID;

  if (!roomId || !message) {
    return { success: false, error: '参数无效' };
  }
  try {
    await db.collection('rooms').doc(roomId).update({
      data: {
        chatMessages: _.push({
          openId: OPENID,
          name: name || '玩家',
          message: message,
          type: 'chat',
          time: Date.now()
        }),
        updatedAt: Date.now()
      }
    });
    return { success: true };
  } catch (e) {
    console.error('sendChat error:', e);
    return { success: false, error: e.message };
  }
};
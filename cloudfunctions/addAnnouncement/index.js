const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { title = '', content = '', priority = 0, duration = 7 } = event;
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '未登录' };

  try {
    const adminCheck = await db.collection('admins').where({ openId: OPENID }).count();
    if (adminCheck.total === 0) {
      return { success: false, error: '无权限' };
    }

    const now = Date.now();
    const endTime = now + parseInt(duration) * 24 * 60 * 60 * 1000;

    await db.collection('announcements').add({
      data: {
        title: title.trim(),
        content: content.trim(),
        priority: parseInt(priority) || 0,
        enabled: true,
        startTime: now,
        endTime: endTime,
        createdBy: OPENID,
        createdAt: now
      }
    });

    return { success: true };
  } catch (err) {
    console.error('addAnnouncement error:', err);
    return { success: false, error: err.message };
  }
};

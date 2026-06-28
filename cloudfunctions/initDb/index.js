const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { OPENID } = cloud.getWXContext();

  const result = { announcements: false, admins: false };

  try {
    // 1. 初始化 announcements 集合（插入一条欢迎公告）
    try {
      const annRes = await db.collection('announcements').count();
      if (annRes.total === 0) {
        await db.collection('announcements').add({
          data: {
            content: '🎉 欢迎来到德州扑克！祝大家游戏愉快，好运连连！',
            createdAt: db.serverDate(),
            createdBy: OPENID
          }
        });
        result.announcements = true;
      } else {
        result.announcements = 'already_exists';
      }
    } catch (e) {
      console.log('initDb: announcements init error', e.message);
    }

    // 2. 初始化 admins 集合（如果为空，将当前用户设为管理员）
    try {
      const adminRes = await db.collection('admins').count();
      if (adminRes.total === 0) {
        await db.collection('admins').add({
          data: {
            _openid: OPENID,
            createdAt: db.serverDate()
          }
        });
        result.admins = true;
      } else {
        result.admins = 'already_exists';
      }
    } catch (e) {
      console.log('initDb: admins init error', e.message);
    }

    return { success: true, result };
  } catch (e) {
    console.error('initDb error:', e);
    return { success: false, error: e.message };
  }
};

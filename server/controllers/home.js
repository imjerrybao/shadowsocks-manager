var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var log4js = require('log4js');
var logger = log4js.getLogger('auth');

var User = mongoose.model('User');
var mail = require('./mail');
var freeAccount = require('./freeAccount');

var crypto = require('crypto');
var md5 = function(text) {
        return crypto.createHash('md5').update(text).digest('hex');
};

var createPassword = function(password, username) {
    return md5(password + username);
};

exports.signup = function(req, res) {
    var email = req.body.username;
    var password = req.body.password;
    User.findOne({email: email}).exec(function(err, data) {
        if(err) {return res.status(500).end('数据库操作错误');}
        else if(data) {return res.status(403).end('该用户已注册');}
        var user = new User();
        user.email = email;
        user.password = createPassword(password, email);
        user.signupIp = req.connection.remoteAddress;
        user.save(function(err, data) {
            if(err) {return res.status(500).end('数据库操作错误');}
            mail.addMail(email);
            logger.info('[' + email + ']注册成功');
            return res.send('success');
        });
    });
};

exports.login = function(req, res) {
    var email = req.body.username;
    var password = req.body.password;

    User.findOne({email: email}).exec(function(err, user) {
        if(err) {return res.status(500).end('数据库操作错误');}
        else if(!user) { return res.status(401).end('用户未注册');}
        var passwordWithMd5 = createPassword(password, user.email);
        if(passwordWithMd5 !== user.password) {
            logger.warn('[' + email + '][' + password + ']登陆失败');
            return res.status(401).end('用户名或密码错误');
        }
        if(!user.isActive) {
            logger.warn('[' + email + '][********]邮箱未验证用户尝试登录');
            return res.status(401).end('该用户的邮箱未验证');
        }
        req.session.user = email;
        req.session.isAdmin = user.isAdmin;
        req.session.save();
        logger.info('[' + email + '][********]登陆成功');
        User.findOneAndUpdate({email: email}, {$set: {lastLogin: new Date()}}).exec();
        res.send('success');
    });
};

exports.logout = function(req, res) {
    req.session.destroy();
    res.send('logout');
};

exports.sendEmail = function(req, res) {
    var username = req.body.username;
    mail.addMail(username);
    res.send({});
};

exports.activeEmail = function(req, res) {
    var activeKey = req.body.activeKey;
    User.findOneAndUpdate({
        isActive: false,
        activeKey: activeKey,
        sendEmailTime: {$gt: new Date(+new Date() - 15 * 60 * 1000)}
    }, {
        $set: {
            isActive: true
        }
    }).exec(function(err, data) {
        if(err || !data) {
            logger.info('[' + activeKey + ']激活失败');
            return res.status(403).end();
        }
        logger.info('[' + activeKey + '][' + data.email + ']激活成功');
        res.send(data);
        freeAccount.create(data.email);
    });
};
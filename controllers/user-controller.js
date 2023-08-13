const bcrypt = require('bcryptjs')
const db = require('../models')
const { User, Comment, Restaurant, Favorite, Like, Followship } = db
const { PROFILE_DEFAULT_AVATAR, imgurFileHandler } = require('../helpers/file-helper')
const { getUser } = require('../helpers/auth-helpers')
const userController = {
  signUpPage: (req, res) => {
    res.render('signup')
  },

  signUp: (req, res, next) => {
    if (req.body.password !== req.body.passwordCheck) throw new Error('password do not match!')
    User.findOne({ where: { email: req.body.email } })
      .then(user => {
        if (user) throw new Error('Email is already exists!')
        return bcrypt.hash(req.body.password, 10)
      })
      .then(hash => User.create({
        name: req.body.name,
        email: req.body.email,
        password: hash,
        image: PROFILE_DEFAULT_AVATAR
      }))
      .then(() => {
        res.redirect('/signin')
      })
      .catch(err => next(err))
  },

  signInPage: (req, res) => {
    res.render('signin')
  },
  // 這邊的登入驗證在總路由的passport做
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入!')
    res.redirect('/restaurants')
  },

  logout: (req, res) => {
    req.flash('success_messages', '登出成功!')
    req.logout()
    res.redirect('/signin')
  },
  getUser: (req, res, next) => {
    // 已評論餐廳、已收藏餐廳、followings、followers
    const currentUserId = getUser(req).id
    return User.findByPk(req.params.id, {
      include: [
        { model: Comment, include: Restaurant },
        { model: Restaurant, as: 'FavoritedRestaurants' },
        { model: User, as: 'Followers' },
        { model: User, as: 'Followings' }
      ]
    })
      .then(user => {
        console.log('currentUserId:', currentUserId)

        if (!user) throw new Error("User didn't exist!")
        const result = user.toJSON()
        const commentRestaurant = result.Comments.map(item => item.Restaurant)
        // 篩選掉重複的commentRestaurant
        const uniqueCommentRestaurant = commentRestaurant.reduce((uniqueArr, currentObj) => {
          // 檢查目前的 id 是否已經在 uniqueArr 中存在
          const exists = uniqueArr.some(obj => obj.id === currentObj.id)
          // 如果 id 還不存在，將目前的物件加入 uniqueArr
          if (!exists) {
            uniqueArr.push(currentObj)
          }
          return uniqueArr
        }, [])
        const commentCount = uniqueCommentRestaurant.length
        const favoritedRestaurantCount = result.FavoritedRestaurants.length
        const followingCount = result.Followings.length
        const followerCount = result.Followers.length

        res.render('users/profile', {
          userData: result,
          currentUserId,
          commentCount,
          favoritedRestaurantCount,
          followingCount,
          followerCount,
          uniqueCommentRestaurant
        })
      })
      .catch(err => next(err))
  },
  editUser: (req, res, next) => {
    return User.findByPk(req.params.id, { raw: true })
      .then(user => {
        if (!user) throw new Error("Profile didn't exist")
        res.render('users/edit', { user })
      })
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    const name = req.body.name
    const userId = req.user.id
    if (!name) throw new Error('User name is required!')
    const { file } = req
    return Promise.all([User.findByPk(userId), imgurFileHandler(file)])
      .then(([user, filePath]) => {
        return user.update({
          name,
          image: filePath || user.image
        })
      })
      .then(() => {
        req.flash('success_messages', '使用者資料編輯成功')
        res.redirect(`/users/${userId}`)
      })
      .catch(err => next(err))
  },
  addFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Favorite.findOne({
        where: {
          userId: req.user.id,
          restaurantId
        }
      })
    ])
      .then(([restaurant, favorite]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist")
        if (favorite) throw new Error('You have favorited this restaurant')

        return Favorite.create({
          userId: req.user.id,
          restaurantId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    return Favorite.findOne({
      where: {
        userId: req.user.id,
        restaurantId
      }
    })
      .then(favorite => {
        if (!favorite) throw new Error("You haven't favorite this restaurant")
        return favorite.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  addLike: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Like.findOne({
        where: {
          userId: req.user.id,
          restaurantId
        }
      })
    ])
      .then(([restaurant, like]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist")
        if (like) throw new Error('You have liked this restaurant')

        return Like.create({
          userId: req.user.id,
          restaurantId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeLike: (req, res, next) => {
    const { restaurantId } = req.params
    return Like.findOne({
      where: {
        userId: req.user.id,
        restaurantId
      }
    })
      .then(like => {
        if (!like) throw new Error("You haven't like this restaurant")

        return like.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  getTopUsers: (req, res, next) => {
    return User.findAll({
      include: [{ model: User, as: 'Followers' }]
    })
      .then(users => {
        // 將users裝進另一個變數好處在於之後若有需要可以再操作原本的users資料與新的result
        const result = users.map(user => ({
          // 整理格式
          ...user.toJSON(),
          // 計算追蹤人數
          followerCount: user.Followers.length,
          // 判斷目前使用者是否已追蹤其他 user
          isFollowed: req.user.Followings.some(f => f.id === user.id)
        }))
        // 排序由大到小
          .sort((a, b) => b.followerCount - a.followerCount)
        res.render('top-users', { users: result })
      })
      .catch(err => next(err))
  },
  addFollowing: (req, res, next) => {
    const { userId } = req.params
    return Promise.all([
      Followship.findOne({
        where: {
          followingId: userId,
          followerId: req.user.id
        }
      }),
      User.findByPk(userId)
    ])
      .then(([followship, user]) => {
        if (!user) throw new Error("User didn't exist")
        if (followship) throw new Error('You are already following this user')

        return Followship.create({
          followingId: userId,
          followerId: req.user.id
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    const { userId } = req.params
    return Followship.findOne({
      where: {
        followingId: userId,
        followerId: req.user.id
      }
    })
      .then(followship => {
        if (!followship) throw new Error("You haven't followed this user")
        return followship.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  }

}

module.exports = userController

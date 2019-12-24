function isFunction(variable) {
  return typeof variable === 'function';
}

function isObject(variable) {
  return typeof variable === 'object' && variable !== null;
}

// 异步调用，在浏览器中使用 setTimeout 替代，但是会有性能问题
// 这里有一个更好的浏览器实现：
// http://www.bluejava.com/4NS/Speed-up-your-Websites-with-a-Faster-setTimeout-using-soon
function callAsync(cb) {
  return setTimeout(cb)
}

// resolvePromise 函数即为根据 x 的值来决定 promise 的状态的函数
// 即标准中的 Promise Resolution Procedure: https://promisesaplus.com/#point-47
function resolvePromise(promise, x, resolve, reject) {
  if (x === promise) {
    return reject(new TypeError('type error'));
  }
  if (x instanceof MyPromise) {
    if (x._state === PENDING) {
      x.then(y => {
        resolvePromise(promise, y, resolve, reject);
      }, reject);
    } else {
      x.then(resolve, reject);
    }
    return;
  }
  if (isObject(x) || isFunction(x)) {
    let isCalled = false;
    try {
      const then = x.then;
      if (isFunction(then)) {
        then.call(x, y => {
          if (isCalled) return;
          isCalled = true;
          resolvePromise(promise, y, resolve, reject);
        }, r => {
          if (isCalled) return;
          isCalled = true;
          reject(r);
        });
      } else {
        resolve(x);
      }
    } catch (err) {
      if (isCalled) return;
      isCalled = true;
      reject(err);
    }
  } else {
    resolve(x);
  }
}

const PENDING = 'PENDING';
const FULFILLED = 'FULFILLED';
const REJECTED = 'REJECTED';

class MyPromise {
  _value;
  _state = PENDING;
  _fulfilledQueue = [];
  _rejectedQueue = [];
  constructor(resolver) {
    if (!isFunction(resolver)) {
      throw new TypeError(`MyPromise resolver must be a function`);
    }
    this._resolve = this._resolve.bind(this);
    this._reject = this._reject.bind(this);
    try {
      resolver(this._resolve, this._reject);
    } catch (err) {
      this._reject(err);
    }
  }
  _resolve(value) {
    // resolve 的值为 Promise，则当前 Promise 直接使用其状态作为自己的状态
    if (value instanceof MyPromise) {
      return value.then(this._resolve, this._reject);
    }
    callAsync(() => {
      if (this._state !== PENDING) return;
      this._value = value;
      this._state = FULFILLED;
      this._fulfilledQueue.forEach(cb => cb(value));
    })
  }
  _reject(reason) {
    callAsync(() => {
      if (this._state !== PENDING) return;
      this._state = REJECTED;
      this._value = reason;
      this._rejectedQueue.forEach(cb => cb(reason));
    })
  }
  then(onFulfilled, onRejected) {
    // 处理 onFulfilled 和 onRejected 为默认向下传值和抛错
    onFulfilled = isFunction(onFulfilled) ? onFulfilled : value => value;
    onRejected = isFunction(onRejected) ? onRejected : reason => { throw reason };

    const promise = new MyPromise((resolve, reject) => {
      const { _state, _value } = this;
      switch (_state) {
        case PENDING:
          this._fulfilledQueue.push(value => {
            try{
              const x = onFulfilled(value);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err)
            };
          });
          this._rejectedQueue.push(reason => {
            try{
              const x = onRejected(reason);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err)
            };
          });
          break;
        case FULFILLED:
          callAsync(() => {
            try{
              const x = onFulfilled(_value);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err)
            };
          })
          break;
        case REJECTED:
          callAsync(() => {
            try{
              const x = onRejected(_value);
              resolvePromise(promise, x, resolve, reject);
            } catch (err) {
              reject(err)
            };
          })
          break;
      }
    })
    return promise;
  }
  catch(onRejected) {
    return this.then(undefined, onRejected);
  }
  finally(cb) {
    return this.then(
      value => MyPromise.resolve(cb()).then(() => value),
      reason => MyPromise.resolve(cb()).then(() => { throw reason })
    )
  }
  static resolve(value) {
    if (value instanceof MyPromise) {
      return value;
    }
    return new MyPromise(resolve => resolve(value));
  }
  static reject(value) {
    return new MyPromise((resolve, reject) => reject(value));
  }
  static all(list) {
    return new MyPromise((resolve, reject) => {
      const values = [];
      let count = 0;
      for (let [i, p] of list.entries()) {
        this.resolve(p).then(res => {
          values[i] = res;
          count++;
          if (count === list.length) resolve(values);
        }, err => {
          reject(err);
        })
      }
    })
  }
  static race(list) {
    return new MyPromise((resolve, reject) => {
      for (let p of list) {
        this.resolve(p).then(res => {
          resolve(res);
        }, err => {
          reject(err);
        })
      }
    })
  }
}

exports.deferred = () => {
  const dfd = {};
  dfd.promise = new MyPromise((rs, rj) => {
    dfd.resolve = rs;
    dfd.reject = rj;
  })
  return dfd;
}

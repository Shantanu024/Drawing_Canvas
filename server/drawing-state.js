
class DrawingState {
  constructor() {
    this.ops = [];          // full history (linear)
    this.activeCount = 0;   // number of active ops (prefix length)
    this.revision = 0;      // bump on any state change
    // Per-user undo/redo tracking: { userId -> { undoneOpIndices: Set } }
    this.userUndoState = new Map();
  }

  addOperation(op) {
    // If we had undone some ops, discard redo tail to keep history linear
    if (this.activeCount < this.ops.length) {
      this.ops = this.ops.slice(0, this.activeCount);
    }
    this.ops.push(op);
    this.activeCount = this.ops.length;
    this.revision++;
  }

  // Global undo (affects everyone)
  undo() {
    if (this.activeCount === 0) return false;
    this.activeCount -= 1;
    this.revision++;
    return true;
  }

  // Global redo (affects everyone)
  redo() {
    if (this.activeCount >= this.ops.length) return false;
    this.activeCount += 1;
    this.revision++;
    return true;
  }

  // Per-user undo: only undo operations by this specific user
  undoUser(userId) {
    if (!this.userUndoState.has(userId)) {
      this.userUndoState.set(userId, { undoneOpIndices: new Set() });
    }
    const userState = this.userUndoState.get(userId);
    
    // Find the most recent active op by this user and mark it as undone
    for (let i = this.activeCount - 1; i >= 0; i--) {
      if (this.ops[i].userId === userId && !userState.undoneOpIndices.has(i)) {
        userState.undoneOpIndices.add(i);
        this.revision++;
        return true;
      }
    }
    return false;
  }

  // Per-user redo: redo the most recent undone operation by this user
  redoUser(userId) {
    if (!this.userUndoState.has(userId)) {
      return false;
    }
    const userState = this.userUndoState.get(userId);
    if (!userState.undoneOpIndices || userState.undoneOpIndices.size === 0) {
      return false;
    }
    
    // Find the most recent undone op by this user and restore it
    let maxIdx = -1;
    for (const idx of userState.undoneOpIndices) {
      if (idx > maxIdx) maxIdx = idx;
    }
    
    if (maxIdx === -1) return false;
    userState.undoneOpIndices.delete(maxIdx);
    this.revision++;
    return true;
  }

  getActiveOps() {
    return this.ops.slice(0, this.activeCount);
  }

  // Get ops that should be rendered (excluding user-undone ones)
  getVisibleOps() {
    const visible = [];
    for (let i = 0; i < this.activeCount; i++) {
      const op = this.ops[i];
      const userState = this.userUndoState.get(op.userId);
      if (!userState || !userState.undoneOpIndices.has(i)) {
        visible.push(op);
      }
    }
    return visible;
  }

  serialize() {
    return {
      ops: this.ops,
      activeCount: this.activeCount,
      userUndoState: Object.fromEntries(
        Array.from(this.userUndoState.entries()).map(([userId, state]) => [
          userId,
          { undoneOpIndices: Array.from(state.undoneOpIndices) }
        ])
      )
    };
  }
}

module.exports = { DrawingState };

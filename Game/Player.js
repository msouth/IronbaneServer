/*
    This file is part of Ironbane MMO.

    Ironbane MMO is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Ironbane MMO is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with Ironbane MMO.  If not, see <http://www.gnu.org/licenses/>.
*/

var KickReason = {
  CHEAT: "Cheating"
};

var Player = Fighter.extend({
  Init: function(data) {

    // Params for players are still unused
    data.param = 0;

    this.readyToReceiveUnits = false;

    // Manual set type for addUnit calls
    this.type = UnitTypeEnum.PLAYER;

    this._super(data);


    this.unitsInLineOfSight = [];


    // Prevent spammers
    this.lastChatTime = 0;

  },
  Tick: function(dTime) {

    // console.log("this.zone: "+this.zone);
    // console.log("this.position: "+this.position.ToString());
    // console.log("this.respawnTimer: "+this.respawnTimer);
    // console.log("this.health: "+this.health);

    if ( !this.chGodMode &&
      this.health > 0 &&
      this.zone === 4 &&
      this.position.y <= 0.1 ) {

        this.SetHealth(0);

        // Remove their items
        this.items = [];

        this.EmitNearby("getMeleeHit", {
          victim:this.id,
          attacker:0,
          h:0,
          a:0
        }, 0, true);

        this.respawnTimer = 10.0;

        chatHandler.announceDiedSpecial(this, "lava");
    }

    this._super(dTime);

  },
  Attack: function(victim, weapon) {

    // Players can only attack monsters and eachother (for now)
    if (victim.id < 0) {
      if (victim.template.type !== UnitTypeEnum.MONSTER) return;
    } else {

      // Only in PvP arenas?

    }

    this._super(victim, weapon);

  },
    Delete: function() {
        // Remove the character from the DB
        // We don't need to delete the unit, since the player can't really do
        // anything anymore and will have to leave sooner or later
        mysql.query('DELETE FROM ib_characters WHERE id = ?', [this.id]);

        this.items = [];
        // Delete the items
        Item.deleteAllForOwner(this.id);
    },
  BigMessage: function(message) {
    this.socket.emit("bigMessage", {
      message: message
    });
  },
  Cutscene: function(id) {
    this.socket.emit("cutscene", id);
  },
  LightWarn: function() {
    var message = this.name + ': Your behaviour is not tolerated. Stop it.';
    chatHandler.Announce('' + message + '', "yellow");
  },
  SeriousWarn: function() {
    var message = this.name + ': Continue like this and you will get banned.<br>You have been warned.';
    chatHandler.Announce('' + message + '', "red");
  },
    Kick: function(reason) {
        var me = this,
            message;

        // Immunity
        if (me.editor) {
            chatHandler.announce(me.name + ' has immunity.', "yellow");
            return;
        }

        reason = reason ? "Reason: " + reason : "No reason given";

        message = me.name + ' has been kicked. (' + reason + ')';
        chatHandler.announce(message, "yellow");

        setTimeout(function() {
            me.socket.disconnect();
        }, 1000);
    },
  Ban: function(hours, reason) {
    // Immunity
    if (this.editor) {
      chatHandler.announce(this.name + ' has immunity.', "red");
      return;
    }

    var me = this;

    hours = hours || 1;

    var reason = reason ? "Reason: " + reason : "No reason given";

    var until = Math.round((new Date()).getTime() / 1000) +
      (parseInt(hours) * 3600);

    var how = hours ? "permanently banned" : "banned for " + hours + " hours";

    var message = this.name + ' has been ' + how + '. (' + reason + ')';
    chatHandler.announce(message, "red");

    mysql.query('INSERT INTO ib_bans SET ?', {
      ip: me.socket.ip,
      account: this.playerID,
      until: until
    }, function() {
      socketHandler.UpdateBans();
    });

    if (!this.isGuest) {
      mysql.query('UPDATE bcs_users SET banned = 1 WHERE id = ?', [this.playerID]);
    }

    setTimeout(function() {
      me.socket.disconnect();
    }, 1000);
  },
    Save: function() {
        var unit = this;

        // No updating for guests
        // Update MYSQL and set the character data
        mysql.query('UPDATE ib_characters SET ' +
            'lastplayed = ?,' +
            'x = ?,' +
            'y = ?,' +
            'z = ?,' +
            'zone = ?,' +
            'roty = ?' +
            ' WHERE id = ?', [
            Math.round(new Date().getTime() / 1000),
            unit.position.x,
            unit.position.y,
            unit.position.z,
            unit.zone,
            unit.rotation.y,
            unit.id
        ]);

        Item.deleteAllForOwner(unit.id).then(function() {
            _.each(unit.items, function(item) {
                // should already be set with owner === unit.id?
                item.$save();
            });
        });
    },
  LeaveGame: function() {

    this.Save();

    chatHandler.announceLoginStatus(this, 'leave');

    var cx = this.cellX;
    var cz = this.cellZ;
    var zone = this.zone;
    var u = 0;
    // Remove the unit from the world cells
    if (worldHandler.CheckWorldStructure(zone, cx, cz)) {
      var newList = [];
      _.each(worldHandler.world[zone][cx][cz].units, function(unit) {
        if (unit.id != this.id) newList.push(unit);
      }, this);
      worldHandler.world[zone][cx][cz].units = newList;
    }

    // Update all players that are nearby
    for (var x = cx - 1; x <= cx + 1; x++) {
      for (var z = cz - 1; z <= cz + 1; z++) {
        if (worldHandler.CheckWorldStructure(zone, x, z)) {
          for (u = 0; u < worldHandler.world[zone][x][z].units.length; u++) {
            worldHandler.world[zone][x][z].units[u].UpdateOtherUnitsList();
          }
        }
      }
    }


  }
});
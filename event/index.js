(function(context) {
    function Event(ctx) {
        var listeners = [];
        
        this.add = function(listener) { listeners.push(listener); return this; };
        
        this.trigger = function trigger(e) {
            for(var i = 0; i < listeners.length; i++) { listeners[i].call(ctx, e, ctx); }
        };
    };
    
    context.Event = Event;
})(exports);
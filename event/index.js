(function(context) {
    function create(ctx) {
        var listeners = [];
        
        function add(listener) { listeners.push(listener); return add; };
        
        add.trigger = function trigger(e) {
            for(var i = 0; i < listeners.length; i++) { listeners[i].apply(ctx, arguments); }
        };
        
        return add;
    }
    
    context.create = create;
})(exports);
(function(context) {
    function create(ctx) {
        var listeners = [], addObj = { add: add };
        
        function add(listener) { listeners.push(listener); return addObj; };
        
        add.trigger = function trigger(e) {
            for(var i = 0; i < listeners.length; i++) { listeners[i].apply(ctx, arguments); }
        };
        
        return add;
    }
    
    context.create = create;
})(exports);